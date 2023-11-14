import { Request } from "koa";
import { Transaction } from "sequelize";
import documentCreator from "@server/commands/documentCreator";
import Logger from "@server/logging/Logger";
import { Collection, Document, User } from "@server/models";
import { authorize } from "@server/policies";
import { NavigationNode } from "~/types";

// Recursive function to loop through nested documents
export default async function createDocumentChildDuplicates({
  collection,
  user,
  request,
  body,
  parentDocument,
  childs,
}: {
  collection: Collection;
  user: User;
  request: Request;
  body: {
    index: number | undefined;
    publish: boolean | undefined;
    editorVersion: string | undefined;
  };
  parentDocument: Document | undefined;
  childs: NavigationNode[] | undefined;
}) {
  authorize(user, "createDocument", user.team);
  authorize(user, "read", parentDocument, { collection });
  Logger.info("commands", `createChildDuplicates for: ${parentDocument.id}`);

  //   const childIds = (childs || []).map((child) => child.id);
  // const childDocuments: Document[] = await Document.findAll({
  //   where: { id: childIds },
  //   userId: user.id,
  // });

  for (const child of childs || []) {
    // Logger.info("commands", `child: ${child}`);
    let i = 1;
    const childDoc: Document | null = await Document.findByPk(child.id, {
      userId: user.id,
    });

    const templateId = childDoc?.templateId;
    let templateDocument;

    if (templateId) {
      templateDocument = await Document.findByPk(templateId, {
        userId: user.id,
      });
      authorize(user, "read", templateDocument);
    }

    const title = `${childDoc?.title}`;
    const text = `${childDoc?.text}`;
    const collectionId = `${childDoc?.collectionId}`;

    const obj = {
      title,
      text,
      publish: body.publish,
      collectionId,
      parentDocumentId: parentDocument.id,
      templateDocument,
      template: child?.template,
      index: i,
      user,
      editorVersion: body.editorVersion,
      ip: request.ip,
    };

    const newDoc = await createDoc({ doc: obj });

    if (child.children.length > 0) {
      await createDocumentChildDuplicates({
        collection,
        user,
        request,
        body,
        parentDocument: newDoc,
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
    return await documentCreator({
      ...doc,
    });
  } catch (err) {
    // console.log("ERROR:", err);
    return;
  }
}
