import fractionalIndex from "fractional-index";
import invariant from "invariant";
import { Request } from "koa";
import Router from "koa-router";
import { Sequelize, Op, WhereOptions } from "sequelize";
import {
  CollectionPermission,
  CollectionStatusFilter,
  FileOperationState,
  FileOperationType,
} from "@shared/types";
import collectionDestroyer from "@server/commands/collectionDestroyer";
import collectionExporter from "@server/commands/collectionExporter";
import documentDuplicator from "@server/commands/documentDuplicator";
import teamUpdater from "@server/commands/teamUpdater";
import { parser } from "@server/editor";
import auth from "@server/middlewares/authentication";
import { rateLimiter } from "@server/middlewares/rateLimiter";
import { transaction } from "@server/middlewares/transaction";
import validate from "@server/middlewares/validate";
import {
  Collection,
  UserMembership,
  GroupMembership,
  Team,
  Event,
  User,
  Group,
  Attachment,
  FileOperation,
  Document,
} from "@server/models";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { authorize } from "@server/policies";
import {
  presentCollection,
  presentUser,
  presentPolicies,
  presentMembership,
  presentGroup,
  presentGroupMembership,
  presentFileOperation,
} from "@server/presenters";
import { APIContext } from "@server/types";
import { RateLimiterStrategy } from "@server/utils/RateLimiter";
import { collectionIndexing } from "@server/utils/indexing";
import removeIndexCollision from "@server/utils/removeIndexCollision";
import pagination from "../middlewares/pagination";
import * as T from "./schema";

const router = new Router();

router.post(
  "collections.create",
  auth(),
  validate(T.CollectionsCreateSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsCreateReq>) => {
    const { transaction } = ctx.state;
    const { name, color, description, data, permission, sharing, icon, sort } =
      ctx.input.body;
    let { index } = ctx.input.body;

    const { user } = ctx.state.auth;
    authorize(user, "createCollection", user.team);

    if (index) {
      index = await removeIndexCollision(user.teamId, index, { transaction });
    } else {
      const first = await Collection.findFirstCollectionForUser(user, {
        attributes: ["id", "index"],
        transaction,
      });
      index = fractionalIndex(null, first ? first.index : null);
    }

    const collection = Collection.build({
      name,
      content: data,
      description: data ? undefined : description,
      icon,
      color,
      teamId: user.teamId,
      createdById: user.id,
      permission,
      sharing,
      sort,
      index,
    });

    if (data) {
      collection.description = DocumentHelper.toMarkdown(collection);
    }

    await collection.save({ transaction });

    await Event.createFromContext(ctx, {
      name: "collections.create",
      collectionId: collection.id,
      data: {
        name,
      },
    });
    // we must reload the collection to get memberships for policy presenter
    const reloaded = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(collection.id, {
      transaction,
    });
    invariant(reloaded, "collection not found");

    ctx.body = {
      data: await presentCollection(ctx, reloaded),
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
    const collection = await Collection.scope([
      {
        method: ["withMembership", user.id],
      },
      "withArchivedBy",
    ]).findByPk(id);

    authorize(user, "read", collection);

    ctx.body = {
      data: await presentCollection(ctx, collection),
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
    const { attachmentId, permission, format } = ctx.input.body;
    const { user } = ctx.state.auth;
    authorize(user, "importCollection", user.team);

    const attachment = await Attachment.findByPk(attachmentId, {
      transaction,
    });
    authorize(user, "read", attachment);

    await FileOperation.createWithCtx(ctx, {
      type: FileOperationType.Import,
      state: FileOperationState.Creating,
      format,
      size: attachment.size,
      key: attachment.key,
      userId: user.id,
      teamId: user.teamId,
      options: {
        permission,
      },
    });

    ctx.body = {
      success: true,
    };
  }
);

router.post(
  "collections.add_group",
  auth(),
  validate(T.CollectionsAddGroupSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsAddGroupsReq>) => {
    const { id, groupId, permission } = ctx.input.body;
    const { transaction } = ctx.state;
    const { user } = ctx.state.auth;

    const [collection, group] = await Promise.all([
      Collection.scope({
        method: ["withMembership", user.id],
      }).findByPk(id, { transaction }),
      Group.findByPk(groupId, { transaction }),
    ]);
    authorize(user, "update", collection);
    authorize(user, "read", group);

    const [membership] = await GroupMembership.findOrCreate({
      where: {
        collectionId: id,
        groupId,
      },
      defaults: {
        permission,
        createdById: user.id,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    membership.permission = permission;
    await membership.save({ transaction });

    await Event.createFromContext(ctx, {
      name: "collections.add_group",
      collectionId: collection.id,
      modelId: groupId,
      data: {
        name: group.name,
        membershipId: membership.id,
      },
    });

    const groupMemberships = [presentGroupMembership(membership)];

    ctx.body = {
      data: {
        // `collectionGroupMemberships` retained for backwards compatibility – remove after version v0.79.0
        collectionGroupMemberships: groupMemberships,
        groupMemberships,
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

    const [collection, group] = await Promise.all([
      Collection.scope({
        method: ["withMembership", user.id],
      }).findByPk(id, {
        transaction,
      }),
      Group.findByPk(groupId, {
        transaction,
      }),
    ]);
    authorize(user, "update", collection);
    authorize(user, "read", group);

    const [membership] = await collection.$get("groupMemberships", {
      where: { groupId },
      transaction,
    });

    if (!membership) {
      ctx.throw(400, "This Group is not a part of the collection");
    }

    await GroupMembership.destroy({
      where: {
        collectionId: id,
        groupId,
      },
      transaction,
    });
    await Event.createFromContext(ctx, {
      name: "collections.remove_group",
      collectionId: collection.id,
      modelId: groupId,
      data: {
        name: group.name,
        membershipId: membership.id,
      },
    });

    ctx.body = {
      success: true,
    };
  }
);

router.post(
  "collections.group_memberships",
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

    let where: WhereOptions<GroupMembership> = {
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
      GroupMembership.count(options),
      GroupMembership.findAll({
        ...options,
        order: [["createdAt", "DESC"]],
        offset: ctx.state.pagination.offset,
        limit: ctx.state.pagination.limit,
      }),
    ]);

    const groupMemberships = memberships.map(presentGroupMembership);

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: {
        // `collectionGroupMemberships` retained for backwards compatibility – remove after version v0.79.0
        collectionGroupMemberships: groupMemberships,
        groupMemberships,
        groups: await Promise.all(
          memberships.map((membership) => presentGroup(membership.group))
        ),
      },
    };
  }
);

router.post(
  "collections.add_user",
  auth(),
  rateLimiter(RateLimiterStrategy.OneHundredPerHour),
  validate(T.CollectionsAddUserSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsAddUserReq>) => {
    const { auth, transaction } = ctx.state;
    const actor = auth.user;
    const { id, userId, permission } = ctx.input.body;

    const [collection, user] = await Promise.all([
      Collection.scope({
        method: ["withMembership", actor.id],
      }).findByPk(id, { transaction }),
      User.findByPk(userId, { transaction }),
    ]);
    authorize(actor, "update", collection);
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

    await Event.createFromContext(ctx, {
      name: "collections.add_user",
      userId,
      modelId: membership.id,
      collectionId: collection.id,
      data: {
        isNew,
        permission: membership.permission,
      },
    });

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

    const [collection, user] = await Promise.all([
      Collection.scope({
        method: ["withMembership", actor.id],
      }).findByPk(id, { transaction }),
      User.findByPk(userId, { transaction }),
    ]);
    authorize(actor, "update", collection);
    authorize(actor, "read", user);

    const [membership] = await collection.$get("memberships", {
      where: { userId },
      transaction,
    });
    if (!membership) {
      ctx.throw(400, "User is not a collection member");
    }

    await collection.$remove("user", user, { transaction });

    await Event.createFromContext(ctx, {
      name: "collections.remove_user",
      userId,
      modelId: membership.id,
      collectionId: collection.id,
      data: {
        name: user.name,
      },
    });

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
  rateLimiter(RateLimiterStrategy.FiftyPerHour),
  auth(),
  validate(T.CollectionsExportSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsExportReq>) => {
    const { id, format, includeAttachments } = ctx.input.body;
    const { transaction } = ctx.state;
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
      ctx,
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
    const { format, includeAttachments } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const team = await Team.findByPk(user.teamId, { transaction });
    authorize(user, "createExport", team);

    const fileOperation = await collectionExporter({
      user,
      team,
      format,
      includeAttachments,
      ctx,
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
    const {
      id,
      name,
      description,
      data,
      icon,
      permission,
      color,
      sort,
      sharing,
    } = ctx.input.body;

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
      collection.content = description
        ? parser.parse(description)?.toJSON()
        : null;
    }

    if (data !== undefined) {
      collection.content = data;
      collection.description = DocumentHelper.toMarkdown(collection);
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
    await Event.createFromContext(ctx, {
      name: "collections.update",
      collectionId: collection.id,
      data: {
        name,
      },
    });

    if (privacyChanged || sharingChanged) {
      await Event.createFromContext(ctx, {
        name: "collections.permission_changed",
        collectionId: collection.id,
        data: {
          privacyChanged,
          sharingChanged,
        },
      });
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
      data: await presentCollection(ctx, collection),
      policies: presentPolicies(user, [collection]),
    };
  }
);

router.post(
  "collections.list",
  auth(),
  validate(T.CollectionsListSchema),
  pagination(),
  transaction(),
  async (ctx: APIContext<T.CollectionsListReq>) => {
    const { includeListOnly, statusFilter } = ctx.input.body;
    const { user } = ctx.state.auth;
    const { transaction } = ctx.state;
    const collectionIds = await user.collectionIds({ transaction });

    const where: WhereOptions<Collection> & {
      [Op.and]: WhereOptions<Collection>[];
    } = {
      teamId: user.teamId,
      [Op.and]: [
        {
          deletedAt: {
            [Op.eq]: null,
          },
        },
      ],
    };

    if (!statusFilter) {
      where[Op.and].push({ archivedAt: { [Op.eq]: null } });
    }

    if (!includeListOnly || !user.isAdmin) {
      where[Op.and].push({ id: collectionIds });
    }

    const statusQuery = [];
    if (statusFilter?.includes(CollectionStatusFilter.Archived)) {
      statusQuery.push({
        archivedAt: {
          [Op.ne]: null,
        },
      });
    }

    if (statusQuery.length) {
      where[Op.and].push({
        [Op.or]: statusQuery,
      });
    }

    const [collections, total] = await Promise.all([
      Collection.scope(
        statusFilter?.includes(CollectionStatusFilter.Archived)
          ? [
              {
                method: ["withMembership", user.id],
              },
              "withArchivedBy",
            ]
          : {
              method: ["withMembership", user.id],
            }
      ).findAll({
        where,
        order: [
          Sequelize.literal('"collection"."index" collate "C"'),
          ["updatedAt", "DESC"],
        ],
        offset: ctx.state.pagination.offset,
        limit: ctx.state.pagination.limit,
        transaction,
      }),
      Collection.count({ where, transaction }),
    ]);

    const nullIndex = collections.findIndex(
      (collection) => collection.index === null
    );

    if (nullIndex !== -1) {
      const indexedCollections = await collectionIndexing(user.teamId, {
        transaction,
      });
      collections.forEach((collection) => {
        collection.index = indexedCollections[collection.id];
      });
    }

    ctx.body = {
      pagination: { ...ctx.state.pagination, total },
      data: await Promise.all(
        collections.map((collection) => presentCollection(ctx, collection))
      ),
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
  "collections.archive",
  auth(),
  validate(T.CollectionsArchiveSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsArchiveReq>) => {
    const { transaction } = ctx.state;
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.scope([
      {
        method: ["withMembership", user.id],
      },
    ]).findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });

    authorize(user, "archive", collection);

    collection.archivedAt = new Date();
    collection.archivedById = user.id;
    await collection.save({ transaction });
    collection.archivedBy = user;

    // Archive all documents within the collection
    await Document.update(
      {
        lastModifiedById: user.id,
        archivedAt: collection.archivedAt,
      },
      {
        where: {
          teamId: collection.teamId,
          collectionId: collection.id,
          archivedAt: {
            [Op.is]: null,
          },
        },
        transaction,
      }
    );

    await Event.createFromContext(ctx, {
      name: "collections.archive",
      collectionId: collection.id,
      data: {
        name: collection.name,
        archivedAt: collection.archivedAt,
      },
    });

    ctx.body = {
      data: await presentCollection(ctx, collection),
      policies: presentPolicies(user, [collection]),
    };
  }
);

router.post(
  "collections.restore",
  auth(),
  validate(T.CollectionsRestoreSchema),
  transaction(),
  async (ctx: APIContext<T.CollectionsRestoreReq>) => {
    const { transaction } = ctx.state;
    const { id } = ctx.input.body;
    const { user } = ctx.state.auth;

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(id, {
      transaction,
      rejectOnEmpty: true,
    });

    authorize(user, "restore", collection);

    const collectionArchivedAt = collection.archivedAt;

    await Document.update(
      {
        lastModifiedById: user.id,
        archivedAt: null,
      },
      {
        where: {
          collectionId: collection.id,
          teamId: user.teamId,
          archivedAt: collection.archivedAt,
        },
        transaction,
      }
    );

    collection.archivedAt = null;
    collection.archivedById = null;
    await collection.save({ transaction });

    await Event.createFromContext(ctx, {
      name: "collections.restore",
      collectionId: collection.id,
      data: {
        name: collection.name,
        archivedAt: collectionArchivedAt,
      },
    });

    ctx.body = {
      data: await presentCollection(ctx, collection!),
      policies: presentPolicies(user, [collection]),
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
      lock: transaction.LOCK.UPDATE,
    });
    authorize(user, "move", collection);

    index = await removeIndexCollision(user.teamId, index, { transaction });
    await collection.update(
      {
        index,
      },
      {
        transaction,
      }
    );
    await Event.createFromContext(ctx, {
      name: "collections.move",
      collectionId: collection.id,
      data: {
        index,
      },
    });

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
    const { transaction } = ctx.state;

    const { user } = ctx.state.auth;

    let documentIds: string[] = [];

    authorize(user, "createCollection", user.team);

    const collection = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(collectionId);
    authorize(user, "read", collection);

    documentIds = (collection?.documentStructure || []).map((node) => node.id);

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

    const duplicateCollection = Collection.build({
      name,
      content: collections[0].data,
      description: collections[0].data ? undefined : description,
      icon,
      color,
      teamId: user.teamId,
      createdById: user.id,
      permission: permission ? permission : null,
      sharing,
      sort,
      index,
    });

    await duplicateCollection.save({ transaction });

    await processDocumentIds({
      duplicateCollection,
      documentIds,
      user,
      request: ctx.request,
    });

    await Event.createFromContext(
      ctx,
      {
        name: "collections.create",
        collectionId: duplicateCollection.id,
        data: {
          name,
        },
      },
      {
        transaction,
      }
    );
    // we must reload the collection to get memberships for policy presenter
    const reloaded = await Collection.scope({
      method: ["withMembership", user.id],
    }).findByPk(collection.id, {
      transaction,
    });
    invariant(reloaded, "collection not found");

    // const duplicateCollection = await Collection.create({
    //   name,
    //   description,
    //   icon,
    //   color,
    //   teamId: user.teamId,
    //   createdById: user.id,
    //   permission: permission ? permission : null,
    //   sharing,
    //   sort,
    //   index,
    // });

    // const editorVersion = ctx.headers["x-editor-version"] as string | undefined;

    // await Event.create({
    //   name: "collections.create",
    //   collectionId: duplicateCollection.id,
    //   teamId: duplicateCollection.teamId,
    //   actorId: user.id,
    //   data: {
    //     name,
    //   },
    //   ip: ctx.request.ip,
    // });

    // we must reload the collection to get memberships for policy presenter
    // const reloaded = await Collection.scope({
    //   method: ["withMembership", user.id],
    // }).findByPk(duplicateCollection.id);
    // invariant(reloaded, "collection not found");

    ctx.body = {
      data: await presentCollection(ctx, reloaded),
      policies: presentPolicies(user, [reloaded]),
    };
  }
);

// Process documentId
async function processDocumentIds({
  duplicateCollection,
  documentIds,
  user,
  request,
}: {
  duplicateCollection: Collection;
  documentIds: string[];
  user: User;
  request: Request;
}) {
  // create duplicate documents in the collection
  for (const documentId of documentIds || []) {
    if (documentId) {
      const parentDocumentId = undefined;
      const document = await Document.findByPk(documentId, {
        userId: user.id,
      });
      if (document) {
        await documentDuplicator({
          user,
          document,
          collection: duplicateCollection,
          title: `${document?.title}`,
          publish: true,
          // transaction,
          recursive: true,
          parentDocumentId,
          ip: request.ip,
        });
      }
    }
  }
}

// async function processDocumentIds({
//   collection,
//   duplicateCollection,
//   documentIds,
//   user,
//   request,
//   body,
// }: {
//   collection: Collection;
//   duplicateCollection: Collection;
//   documentIds: string[];
//   user: User;
//   request: Request;
//   body: {
//     index: number | undefined;
//     publish: boolean | undefined;
//     editorVersion: string | undefined;
//   };
// }) {
//   // console.log("processDocumentIds:", documentIds);

//   let templateDocument: Document | null | undefined;
//   authorize(user, "createDocument", user.team);

//   // create duplicate documents in the collection
//   for (const documentId of documentIds || []) {
//     // console.log("documentId", documentId);
//     const document: Document | null = await Document.findByPk(documentId, {
//       userId: user.id,
//     });

//     authorize(user, "read", document, {
//       collection,
//     });
//     const duplicateDocument = await documentCreator({
//       title: `${document?.title}`,
//       text: `${document?.text}`,
//       publish: true,
//       collectionId: duplicateCollection.id,
//       parentDocumentId: undefined,
//       templateDocument,
//       template: undefined,
//       // index: undefined,
//       user,
//       editorVersion: body.editorVersion,
//       ip: request.ip,
//     });
//     authorize(user, "read", duplicateDocument, {
//       duplicateCollection,
//     });

//     const documentTree: NavigationNode | null =
//       collection.getDocumentTree(documentId);

//     // console.log("EHTI LOG: ", documentTree?.children?.length);
//     if (documentTree?.children?.length) {
//       // Create duplicates of nested docs
//       // console.log("EHTI LOG: 1");
//       // eslint-disable-next-line @typescript-eslint/no-floating-promises
//       createChildDuplicates({
//         collection,
//         duplicateCollection,
//         user,
//         request,
//         body: {
//           index: undefined,
//           publish: true,
//           editorVersion: body.editorVersion,
//         },
//         parentDocumentId: duplicateDocument.id,
//         childs: documentTree?.children,
//       });
//     }
//   }
// }

// Recursive function to loop through nested documents
// async function createChildDuplicates({
//   collection,
//   duplicateCollection,
//   user,
//   request,
//   body,
//   parentDocumentId,
//   childs,
// }: {
//   collection: Collection;
//   duplicateCollection: Collection;
//   user: User;
//   request: Request;
//   body: {
//     index: number | undefined;
//     publish: boolean | undefined;
//     editorVersion: string | undefined;
//   };
//   parentDocumentId: string | undefined;
//   childs: NavigationNode[] | undefined;
// }) {
//   if (parentDocumentId) {
//     assertUuid(parentDocumentId, "parentDocumentId must be an uuid");
//   }

//   if (body.index) {
//     assertPositiveInteger(body.index, "index must be an integer (>=0)");
//   }
//   authorize(user, "createDocument", user.team);

//   let parentDocument;

//   if (parentDocumentId) {
//     parentDocument = await Document.findOne({
//       where: {
//         id: parentDocumentId,
//         collectionId: duplicateCollection.id,
//       },
//     });
//     authorize(user, "read", parentDocument, {
//       duplicateCollection,
//     });
//   }
//   for (const child of childs || []) {
//     let i = 1;
//     const childDoc: Document | null = await Document.findByPk(child.id, {
//       userId: user.id,
//     });

//     let templateDocument: Document | null | undefined;
//     if (childDoc?.templateId) {
//       templateDocument = await Document.findByPk(childDoc?.templateId, {
//         userId: user.id,
//       });
//       authorize(user, "read", templateDocument);
//     }
//     const obj = {
//       title: `${childDoc?.title}`,
//       text: `${childDoc?.text}`,
//       publish: body.publish,
//       collectionId: `${duplicateCollection.id}`,
//       parentDocumentId,
//       templateDocument,
//       template: childDoc?.template,
//       index: i,
//       user,
//       editorVersion: body.editorVersion,
//       ip: request.ip,
//     };

//     // console.log("EHTI LOG: 2", obj);
//     const childData = await createDoc({ doc: obj });
//     // console.log("EHTI LOG: 3", childData);
//     if (child.children.length > 0) {
//       await createChildDuplicates({
//         collection,
//         duplicateCollection,
//         user,
//         request,
//         body,
//         parentDocumentId: childData?.id,
//         childs: child.children,
//       });
//     }
//     i += 1;
//   }
// }

// Function creates a new document
// async function createDoc({
//   doc,
// }: {
//   doc: {
//     title: string;
//     text: string;
//     publish: boolean | undefined;
//     collectionId: string;
//     parentDocumentId: string | undefined;
//     templateDocument: Document | null | undefined;
//     template: boolean | undefined;
//     index: number | undefined;
//     user: User;
//     editorVersion: string | undefined;
//     ip: string | undefined;
//     id?: string | undefined;
//     publishedAt?: Date | undefined;
//     createdAt?: Date | undefined;
//     updatedAt?: Date | undefined;
//     source?: "import" | undefined;
//     transaction?: Transaction;
//   };
// }): Promise<Document | undefined> {
//   try {
//     const response = await documentCreator(doc);
//     return response;
//   } catch (err) {
//     console.log("createDoc ERROR:", err);
//     throw err; // You can rethrow the error to maintain the rejection behavior
//   }
//   // return new Promise(async (resolve, reject) => {
//   //   try {
//   //     let response = await documentCreator({
//   //       ...doc,
//   //     });
//   //     resolve(response);
//   //   } catch (err) {
//   //     console.log("createDoc ERROR:", err);
//   //     reject(err);
//   //   }
//   // });
// }

export default router;
