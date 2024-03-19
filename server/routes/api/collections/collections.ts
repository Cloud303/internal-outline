import fractionalIndex from "fractional-index";
import invariant from "invariant";
import { Request } from "koa";
import Router from "koa-router";
import { Sequelize, Op, WhereOptions, Transaction } from "sequelize";
import {
  CollectionPermission,
  FileOperationState,
  FileOperationType,
} from "@shared/types";
import collectionDestroyer from "@server/commands/collectionDestroyer";
import collectionExporter from "@server/commands/collectionExporter";
import documentCreator from "@server/commands/documentCreator";
import teamUpdater from "@server/commands/teamUpdater";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import {
  Collection,
  UserMembership,
  GroupPermission,
  Team,
  Event,
  User,
  Group,
  Attachment,
  FileOperation,
  Document,
} from "@server/models";
import { authorize } from "@server/policies";
import {
  presentCollection,
  presentUser,
  presentPolicies,
  presentMembership,
  presentGroup,
  presentCollectionGroupMembership,
  presentFileOperation,
} from "@server/presenters";
import { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import { collectionIndexing } from "@server/utils/indexing";
import removeIndexCollision from "@server/utils/removeIndexCollision";
import { assertUuid, assertPositiveInteger } from "@server/validation";
import { NavigationNode } from "~/types";
import pagination from "../middlewares/pagination";
import * as T from "./schema";

const router = new Router();

router.post(
  "collections.create",
  auth(),
  validate(T.CollectionsCreateSchema),
  async (ctx: APIContext<T.CollectionsCreateReq>) => {
    const { name, color, description, permission, sharing, icon, sort } =
      ctx.input.body;
    let { index } = ctx.input.body;

    const { user } = ctx.state.auth;
    authorize(user, "createCollection", user.team);

    if (!index) {
      const collections = await Collection.findAll({
        where: {
          teamId: user.teamId,
          deletedAt: null,
        },
        attributes: ["id", "index", "updatedAt"],
        limit: 1,
        order: [
          // using LC_COLLATE:"C" because we need byte order to drive the sorting
          Sequelize.literal('"collection"."index" collate "C"'),
          ["updatedAt", "DESC"],
        ],
      });

      index = fractionalIndex(
        null,
        collections.length ? collections[0].index : null
      );
    }

    index = await removeIndexCollision(user.teamId, index);
    const collection = await Collection.create({
      name,
      description,
      icon,
      color,
      teamId: user.teamId,
      createdById: user.id,
      permission,
      sharing,
      sort,
      index,
    });
    await Event.create({
      name: "collections.create",
      collectionId: collection.id,
      teamId: collection.teamId,
      actorId: user.id,
      data: {
        name,
      },
      ip: ctx.request.ip,
    });
    // we must reload the collection to get memberships for policy presenter
    const reloaded = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(collection.id);
    invariant(reloaded, "collection not found");

    ctx.body = {
      data: presentCollection(reloaded),
      policies: presentPolicies(user, [reloaded]),
    };
  }
);

router.post(
  "collections.info",
  auth(),
  validate(T.CollectionsInfoSchema),
  async (ctx: APIContext<T.CollectionsInfoReq>) => {
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;
    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id);

    authorize(user, "read", collection);

    ctx.body = {
      data: presentCollection(collection),
      policies: presentPolicies(user, [collection]),
    };
  }
);

router.post(
  "collections.documents",
  auth(),
  validate(T.CollectionsDocumentsSchema),
  async (ctx: APIContext<T.CollectionsDocumentsReq>) => {
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;
    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id);

    authorize(user, "readDocument", collection);

    ctx.body = {
      data: collection.documentStructure || [],
    };
  }
);

router.post(
  "collections.import",
  rateLimiter(RateLimiterStrategy.TenPerHour),
  auth(),
  validate(T.CollectionsImportSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsImportReq>) => {
    const { transaction } = ctx.state;
    const { attachmentId, format } = ctx.input.body;

    const { user } = ctx.state.auth;
    authorize(user, "importCollection", user.team);

    const attachment = await Attachment.findByPk(attachmentId, {
      transaction,
    });
    authorize(user, "read", attachment);

    const fileOperation = await FileOperation.create(
      {
        type: FileOperationType.Import,
        state: FileOperationState.Creating,
        format,
        size: attachment.size,
        key: attachment.key,
        userId: user.id,
        teamId: user.teamId,
      },
      {
        transaction,
      }
    );

    await Event.create(
      {
        name: "fileOperations.create",
        teamId: user.teamId,
        actorId: user.id,
        modelId: fileOperation.id,
        data: {
          type: FileOperationType.Import,
        },
      },
      {
        transaction,
      }
    );

    ctx.body = {
      success: true,
    };
  }
);

router.post(
  "collections.add_group",
  auth(),
  validate(T.CollectionsAddGroupSchema),
  async (ctx: APIContext<T.CollectionsAddGroupsReq>) => {
    const { id, groupId, permission } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id);
    authorize(user, "update", collection);

    const group = await Group.findByPk(groupId);
    authorize(user, "read", group);

    let membership = await GroupPermission.findOne({
      where: {
        collectionId: id,
        groupId,
      },
    });

    if (!membership) {
      membership = await GroupPermission.create({
        collectionId: id,
        groupId,
        permission,
        createdById: user.id,
      });
    } else {
      membership.permission = permission;
      await membership.save();
    }

    await Event.create({
      name: "collections.add_group",
      collectionId: collection.id,
      teamId: collection.teamId,
      actorId: user.id,
      modelId: groupId,
      data: {
        name: group.name,
        membershipId: membership.id,
      },
      ip: ctx.request.ip,
    });

    ctx.body = {
      data: {
        collectionGroupMemberships: [
          presentCollectionGroupMembership(membership),
        ],
      },
    };
  }
);

router.post(
  "collections.remove_group",
  auth(),
  validate(T.CollectionsRemoveGroupSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsRemoveGroupReq>) => {
    const { id, groupId } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id, { transaction });
    authorize(user, "update", collection);

    const group = await Group.findByPk(groupId, { transaction });
    authorize(user, "read", group);

    const [membership] = await collection.$get("collectionGroupMemberships", {
      where: { groupId },
      transaction,
    });

    if (!membership) {
      ctx.throw(400, "This Group is not a part of the collection");
    }

    await collection.$remove("group", group);
    await Event.create(
      {
        name: "collections.remove_group",
        collectionId: collection.id,
        teamId: collection.teamId,
        actorId: user.id,
        modelId: groupId,
        data: {
          name: group.name,
          membershipId: membership.id,
        },
        ip: ctx.request.ip,
      },
      { transaction }
    );

    ctx.body = {
      success: true,
    };
  }
);

router.post(
  "collections.group_memberships",
  auth(),
  pagination(),
  validate(T.CollectionsGroupMembershipsSchema),
  async (ctx: APIContext<T.CollectionsGroupMembershipsReq>) => {
    const { id, query, permission } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id);
    authorize(user, "read", collection);

    let where: WhereOptions<GroupPermission> = {
      collectionId: id,
    };
    let groupWhere;

    if (query) {
      groupWhere = {
        name: {
          [Op.iLike]: `%${query}%`,
        },
      };
    }

    if (permission) {
      where = { ...where, permission };
    }

    const options = {
      where,
      include: [
        {
          model: Group,
          as: "group",
          where: groupWhere,
          required: true,
        },
      ],
    };

    const [total, memberships] = await Promise.all([
      GroupPermission.count(options),
      GroupPermission.findAll({
        ...options,
        order: [["createdAt", "DESC"]],
        offset: ctx.state.pagination.offset,
        limit: ctx.state.pagination.limit,
      }),
    ]);

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: {
        collectionGroupMemberships: memberships.map(
          presentCollectionGroupMembership
        ),
        groups: memberships.map((membership) => presentGroup(membership.group)),
      },
    };
  }
);

router.post(
  "collections.add_user",
  auth(),
  rateLimiter(RateLimiterStrategy.OneHundredPerHour),
  transaction(),
  validate(T.CollectionsAddUserSchema),
  async (ctx: APIContext<T.CollectionsAddUserReq>) => {
    const { auth, transaction } = ctx.state;
    const actor = auth.user;
    const { id, userId, permission } = ctx.input.body;

    const collection = await Collection.scope({
      method: ["withMembership", actor.id],
    }).findByPk(id, { transaction });
    authorize(actor, "update", collection);

    const user = await User.findByPk(userId);
    authorize(actor, "read", user);

    const [membership, isNew] = await UserMembership.findOrCreate({
      where: {
        collectionId: id,
        userId,
      },
      defaults: {
        permission: permission || user.defaultCollectionPermission,
        createdById: actor.id,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (permission) {
      membership.permission = permission;
      await membership.save({ transaction });
    }

    await Event.create(
      {
        name: "collections.add_user",
        userId,
        modelId: membership.id,
        collectionId: collection.id,
        teamId: collection.teamId,
        actorId: actor.id,
        data: {
          isNew,
          permission: membership.permission,
        },
        ip: ctx.request.ip,
      },
      {
        transaction,
      }
    );

    ctx.body = {
      data: {
        users: [presentUser(user)],
        memberships: [presentMembership(membership)],
      },
    };
  }
);

router.post(
  "collections.remove_user",
  auth(),
  validate(T.CollectionsRemoveUserSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsRemoveUserReq>) => {
    const { auth, transaction } = ctx.state;
    const actor = auth.user;
    const { id, userId } = ctx.input.body;

    const collection = await Collection.scope({
      method: ["withMembership", actor.id],
    }).findByPk(id, { transaction });
    authorize(actor, "update", collection);

    const user = await User.findByPk(userId, { transaction });
    authorize(actor, "read", user);

    const [membership] = await collection.$get("memberships", {
      where: { userId },
      transaction,
    });
    if (!membership) {
      ctx.throw(400, "User is not a collection member");
    }

    await collection.$remove("user", user, { transaction });

    await Event.create(
      {
        name: "collections.remove_user",
        userId,
        modelId: membership.id,
        collectionId: collection.id,
        teamId: collection.teamId,
        actorId: actor.id,
        data: {
          name: user.name,
        },
        ip: ctx.request.ip,
      },
      { transaction }
    );

    ctx.body = {
      success: true,
    };
  }
);

router.post(
  "collections.memberships",
  auth(),
  pagination(),
  validate(T.CollectionsMembershipsSchema),
  async (ctx: APIContext<T.CollectionsMembershipsReq>) => {
    const { id, query, permission } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id);
    authorize(user, "read", collection);

    let where: WhereOptions<UserMembership> = {
      collectionId: id,
    };
    let userWhere;

    if (query) {
      userWhere = {
        name: {
          [Op.iLike]: `%${query}%`,
        },
      };
    }

    if (permission) {
      where = { ...where, permission };
    }

    const options = {
      where,
      include: [
        {
          model: User,
          as: "user",
          where: userWhere,
          required: true,
        },
      ],
    };

    const [total, memberships] = await Promise.all([
      UserMembership.count(options),
      UserMembership.findAll({
        ...options,
        order: [["createdAt", "DESC"]],
        offset: ctx.state.pagination.offset,
        limit: ctx.state.pagination.limit,
      }),
    ]);

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: {
        memberships: memberships.map(presentMembership),
        users: memberships.map((membership) => presentUser(membership.user)),
      },
    };
  }
);

router.post(
  "collections.export",
  rateLimiter(RateLimiterStrategy.TenPerHour),
  auth(),
  validate(T.CollectionsExportSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsExportReq>) => {
    const { transaction } = ctx.state;
    const { id, format, includeAttachments } = ctx.input.body;
    const { user } = ctx.state.auth;

    const team = await Team.findByPk(user.teamId, { transaction });
    authorize(user, "createExport", team);

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id, { transaction });
    authorize(user, "export", collection);

    const fileOperation = await collectionExporter({
      collection,
      user,
      team,
      format,
      includeAttachments,
      ip: ctx.request.ip,
      transaction,
    });

    ctx.body = {
      success: true,
      data: {
        fileOperation: presentFileOperation(fileOperation),
      },
    };
  }
);

router.post(
  "collections.export_all",
  rateLimiter(RateLimiterStrategy.FivePerHour),
  auth(),
  validate(T.CollectionsExportAllSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsExportAllReq>) => {
    const { transaction } = ctx.state;
    const { format, includeAttachments } = ctx.input.body;
    const { user } = ctx.state.auth;
    const team = await Team.findByPk(user.teamId, { transaction });
    authorize(user, "createExport", team);

    const fileOperation = await collectionExporter({
      user,
      team,
      format,
      includeAttachments,
      ip: ctx.request.ip,
      transaction,
    });

    ctx.body = {
      success: true,
      data: {
        fileOperation: presentFileOperation(fileOperation),
      },
    };
  }
);

router.post(
  "collections.update",
  auth(),
  validate(T.CollectionsUpdateSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsUpdateReq>) => {
    const { transaction } = ctx.state;
    const { id, name, description, icon, permission, color, sort, sharing } =
      ctx.input.body;

    const { user } = ctx.state.auth;
    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id, {
      transaction,
    });
    authorize(user, "update", collection);

    // we're making this collection have no default access, ensure that the
    // current user has an admin membership so that at least they can manage it.
    if (
      permission !== CollectionPermission.ReadWrite &&
      collection.permission === CollectionPermission.ReadWrite
    ) {
      await UserMembership.findOrCreate({
        where: {
          collectionId: collection.id,
          userId: user.id,
        },
        defaults: {
          permission: CollectionPermission.Admin,
          createdById: user.id,
        },
        transaction,
      });
    }

    let privacyChanged = false;
    let sharingChanged = false;

    if (name !== undefined) {
      collection.name = name.trim();
    }

    if (description !== undefined) {
      collection.description = description;
    }

    if (icon !== undefined) {
      collection.icon = icon;
    }

    if (color !== undefined) {
      collection.color = color;
    }

    if (permission !== undefined) {
      privacyChanged = permission !== collection.permission;
      collection.permission = permission ? permission : null;
    }

    if (sharing !== undefined) {
      sharingChanged = sharing !== collection.sharing;
      collection.sharing = sharing;
    }

    if (sort !== undefined) {
      collection.sort = sort;
    }

    await collection.save({ transaction });
    await Event.create(
      {
        name: "collections.update",
        collectionId: collection.id,
        teamId: collection.teamId,
        actorId: user.id,
        data: {
          name,
        },
        ip: ctx.request.ip,
      },
      {
        transaction,
      }
    );

    if (privacyChanged || sharingChanged) {
      await Event.create(
        {
          name: "collections.permission_changed",
          collectionId: collection.id,
          teamId: collection.teamId,
          actorId: user.id,
          data: {
            privacyChanged,
            sharingChanged,
          },
          ip: ctx.request.ip,
        },
        {
          transaction,
        }
      );
    }

    // must reload to update collection membership for correct policy calculation
    // if the privacy level has changed. Otherwise skip this query for speed.
    if (privacyChanged || sharingChanged) {
      await collection.reload({ transaction });
      const team = await Team.findByPk(user.teamId, {
        transaction,
        rejectOnEmpty: true,
      });

      if (
        collection.permission === null &&
        team?.defaultCollectionId === collection.id
      ) {
        await teamUpdater({
          params: { defaultCollectionId: null },
          ip: ctx.request.ip,
          user,
          team,
          transaction,
        });
      }
    }

    ctx.body = {
      data: presentCollection(collection),
      policies: presentPolicies(user, [collection]),
    };
  }
);

router.post(
  "collections.list",
  auth(),
  validate(T.CollectionsListSchema),
  pagination(),
  async (ctx: APIContext<T.CollectionsListReq>) => {
    const { includeListOnly } = ctx.input.body;
    const { user } = ctx.state.auth;
    const collectionIds = await user.collectionIds();
    const where: WhereOptions<Collection> =
      includeListOnly && user.isAdmin
        ? {
            teamId: user.teamId,
          }
        : {
            teamId: user.teamId,
            id: collectionIds,
          };
    const [collections, total] = await Promise.all([
      Collection.scope({
        method: ["withMembership", user.id],
      }).findAll({
        where,
        order: [
          Sequelize.literal('"collection"."index" collate "C"'),
          ["updatedAt", "DESC"],
        ],
        offset: ctx.state.pagination.offset,
        limit: ctx.state.pagination.limit,
      }),
      Collection.count({ where }),
    ]);

    const nullIndex = collections.findIndex(
      (collection) => collection.index === null
    );

    if (nullIndex !== -1) {
      const indexedCollections = await collectionIndexing(user.teamId);
      collections.forEach((collection) => {
        collection.index = indexedCollections[collection.id];
      });
    }

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: collections.map(presentCollection),
      policies: presentPolicies(user, collections),
    };
  }
);

router.post(
  "collections.delete",
  auth(),
  validate(T.CollectionsDeleteSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsDeleteReq>) => {
    const { transaction } = ctx.state;
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id, {
      transaction,
    });

    authorize(user, "delete", collection);

    await collectionDestroyer({
      collection,
      transaction,
      user,
      ip: ctx.request.ip,
    });

    ctx.body = {
      success: true,
    };
  }
);

router.post(
  "collections.move",
  auth(),
  validate(T.CollectionsMoveSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsMoveReq>) => {
    const { transaction } = ctx.state;
    const { id } = ctx.input.body;
    let { index } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.findByPk(id, {
      transaction,
    });
    authorize(user, "move", collection);

    index = await removeIndexCollision(user.teamId, index);
    await collection.update(
      {
        index,
      },
      {
        transaction,
      }
    );
    await Event.create(
      {
        name: "collections.move",
        collectionId: collection.id,
        teamId: collection.teamId,
        actorId: user.id,
        data: {
          index,
        },
        ip: ctx.request.ip,
      },
      {
        transaction,
      }
    );

    ctx.body = {
      success: true,
      data: {
        index,
      },
    };
  }
);

router.post(
  "collections.duplicate",
  auth(),
  validate(T.CollectionsDuplicateSchema),
  async (ctx: APIContext<T.CollectionsDuplicateReq>) => {
    const {
      name,
      color,
      description,
      permission,
      sharing,
      icon,
      sort,
      collectionId,
    } = ctx.input.body;

    const { user } = ctx.state.auth;

    let documentIds: string[] = [];

    // get documet tree
    let where: WhereOptions<Document> = {
      teamId: user.teamId,
      archivedAt: {
        [Op.is]: null,
      },
    };
    authorize(user, "createCollection", user.team);
    where = { ...where, collectionId };
    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(collectionId);
    authorize(user, "read", collection);
    // console.log("collection?.documentStructure:", collection?.documentStructure);

    documentIds = (collection?.documentStructure || []).map((node) => node.id);

    // console.log("collections.duplicate:", documentIds);

    // create new collection
    const collections = await Collection.findAll({
      where: {
        teamId: user.teamId,
        deletedAt: null,
      },
      attributes: ["id", "index", "updatedAt"],
      limit: 1,
      order: [
        // using LC_COLLATE:"C" because we need byte order to drive the sorting
        Sequelize.literal('"collection"."index" collate "C"'),
        ["updatedAt", "DESC"],
      ],
    });
    let index = fractionalIndex(
      null,
      collections.length ? collections[0].index : null
    );
    index = await removeIndexCollision(user.teamId, index);
    const duplicateCollection = await Collection.create({
      name,
      description,
      icon,
      color,
      teamId: user.teamId,
      createdById: user.id,
      permission: permission ? permission : null,
      sharing,
      sort,
      index,
    });

    const editorVersion = ctx.headers["x-editor-version"] as string | undefined;

    await processDocumentIds({
      collection,
      duplicateCollection,
      documentIds,
      user,
      request: ctx.request,
      body: {
        index: undefined,
        publish: true,
        editorVersion,
      },
    });

    await Event.create({
      name: "collections.create",
      collectionId: duplicateCollection.id,
      teamId: duplicateCollection.teamId,
      actorId: user.id,
      data: {
        name,
      },
      ip: ctx.request.ip,
    });

    // we must reload the collection to get memberships for policy presenter
    const reloaded = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(duplicateCollection.id);
    invariant(reloaded, "collection not found");

    ctx.body = {
      data: presentCollection(reloaded),
      policies: presentPolicies(user, [reloaded]),
    };
  }
);

// Process documentId
async function processDocumentIds({
  collection,
  duplicateCollection,
  documentIds,
  user,
  request,
  body,
}: {
  collection: Collection;
  duplicateCollection: Collection;
  documentIds: string[];
  user: User;
  request: Request;
  body: {
    index: number | undefined;
    publish: boolean | undefined;
    editorVersion: string | undefined;
  };
}) {
  // console.log("processDocumentIds:", documentIds);

  let templateDocument: Document | null | undefined;
  authorize(user, "createDocument", user.team);

  // create duplicate documents in the collection
  for (const documentId of documentIds || []) {
    // console.log("documentId", documentId);
    const document: Document | null = await Document.findByPk(documentId, {
      userId: user.id,
    });

    authorize(user, "read", document, {
      collection,
    });
    const duplicateDocument = await documentCreator({
      title: `${document?.title}`,
      text: `${document?.text}`,
      publish: true,
      collectionId: duplicateCollection.id,
      parentDocumentId: undefined,
      templateDocument,
      template: undefined,
      // index: undefined,
      user,
      editorVersion: body.editorVersion,
      ip: request.ip,
    });
    authorize(user, "read", duplicateDocument, {
      duplicateCollection,
    });

    const documentTree: NavigationNode | null =
      collection.getDocumentTree(documentId);

    // console.log("EHTI LOG: ", documentTree?.children?.length);
    if (documentTree?.children?.length) {
      // Create duplicates of nested docs
      // console.log("EHTI LOG: 1");
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      createChildDuplicates({
        collection,
        duplicateCollection,
        user,
        request,
        body: {
          index: undefined,
          publish: true,
          editorVersion: body.editorVersion,
        },
        parentDocumentId: duplicateDocument.id,
        childs: documentTree?.children,
      });
    }
  }
}

// Recursive function to loop through nested documents
async function createChildDuplicates({
  collection,
  duplicateCollection,
  user,
  request,
  body,
  parentDocumentId,
  childs,
}: {
  collection: Collection;
  duplicateCollection: Collection;
  user: User;
  request: Request;
  body: {
    index: number | undefined;
    publish: boolean | undefined;
    editorVersion: string | undefined;
  };
  parentDocumentId: string | undefined;
  childs: NavigationNode[] | undefined;
}) {
  if (parentDocumentId) {
    assertUuid(parentDocumentId, "parentDocumentId must be an uuid");
  }

  if (body.index) {
    assertPositiveInteger(body.index, "index must be an integer (>=0)");
  }
  authorize(user, "createDocument", user.team);

  let parentDocument;

  if (parentDocumentId) {
    parentDocument = await Document.findOne({
      where: {
        id: parentDocumentId,
        collectionId: duplicateCollection.id,
      },
    });
    authorize(user, "read", parentDocument, {
      duplicateCollection,
    });
  }
  for (const child of childs || []) {
    let i = 1;
    const childDoc: Document | null = await Document.findByPk(child.id, {
      userId: user.id,
    });

    let templateDocument: Document | null | undefined;
    if (childDoc?.templateId) {
      templateDocument = await Document.findByPk(childDoc?.templateId, {
        userId: user.id,
      });
      authorize(user, "read", templateDocument);
    }
    const obj = {
      title: `${childDoc?.title}`,
      text: `${childDoc?.text}`,
      publish: body.publish,
      collectionId: `${duplicateCollection.id}`,
      parentDocumentId,
      templateDocument,
      template: childDoc?.template,
      index: i,
      user,
      editorVersion: body.editorVersion,
      ip: request.ip,
    };

    // console.log("EHTI LOG: 2", obj);
    const childData = await createDoc({ doc: obj });
    // console.log("EHTI LOG: 3", childData);
    if (child.children.length > 0) {
      await createChildDuplicates({
        collection,
        duplicateCollection,
        user,
        request,
        body,
        parentDocumentId: childData?.id,
        childs: child.children,
      });
    }
    i += 1;
  }
}

// Function creates a new document
async function createDoc({
  doc,
}: {
  doc: {
    title: string;
    text: string;
    publish: boolean | undefined;
    collectionId: string;
    parentDocumentId: string | undefined;
    templateDocument: Document | null | undefined;
    template: boolean | undefined;
    index: number | undefined;
    user: User;
    editorVersion: string | undefined;
    ip: string | undefined;
    id?: string | undefined;
    publishedAt?: Date | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
    source?: "import" | undefined;
    transaction?: Transaction;
  };
}): Promise<Document | undefined> {
  try {
    const response = await documentCreator(doc);
    return response;
  } catch (err) {
    console.log("createDoc ERROR:", err);
    throw err; // You can rethrow the error to maintain the rejection behavior
  }
  // return new Promise(async (resolve, reject) => {
  //   try {
  //     let response = await documentCreator({
  //       ...doc,
  //     });
  //     resolve(response);
  //   } catch (err) {
  //     console.log("createDoc ERROR:", err);
  //     reject(err);
  //   }
  // });
}

export default router;
