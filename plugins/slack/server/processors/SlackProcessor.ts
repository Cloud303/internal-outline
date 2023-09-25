/* eslint-disable no-console */
import { differenceInMilliseconds } from "date-fns";
import { Op } from "sequelize";
import { IntegrationService, IntegrationType } from "@shared/types";
import { Minute } from "@shared/utils/time";
import env from "@server/env";
import { Document, Integration, Collection, Team } from "@server/models";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import {
  DocumentEvent,
  IntegrationEvent,
  RevisionEvent,
  Event,
} from "@server/types";
import fetch from "@server/utils/fetch";
import presentMessageAttachment from "../presenters/messageAttachment";

export default class SlackProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = [
    "documents.publish",
    "documents.move",
    "documents.update",
    "revisions.create",
    "integrations.create",
  ];

  async perform(event: Event) {
    switch (event.name) {
      case "documents.publish":
      case "revisions.create":
        return this.documentUpdated(event);
      case "documents.move":
      case "documents.update":
        return this.documentUpdated(event);

      case "integrations.create":
        return this.integrationCreated(event);

      default:
    }
  }

  async integrationCreated(event: IntegrationEvent) {
    const integration = (await Integration.findOne({
      where: {
        id: event.modelId,
        service: IntegrationService.Slack,
        type: IntegrationType.Post,
      },
      include: [
        {
          model: Collection,
          required: true,
          as: "collection",
        },
      ],
    })) as Integration<IntegrationType.Post>;
    if (!integration) {
      return;
    }

    const collection = integration.collection;
    if (!collection) {
      return;
    }

    await fetch(integration.settings.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: `👋 Hey there! When documents are published or updated in the *${collection.name}* collection on ${env.APP_NAME} they will be posted to this channel!`,
        attachments: [
          {
            color: collection.color,
            title: collection.name,
            title_link: `${env.URL}${collection.url}`,
            text: collection.description,
          },
        ],
      }),
    });
  }

  async documentUpdated(event: DocumentEvent | RevisionEvent) {
    // never send notifications when batch importing documents
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'data' does not exist on type 'DocumentEv... Remove this comment to see the full error message
    if (event.data && event.data.source === "import") {
      return;
    }
    const [document, team] = await Promise.all([
      Document.findByPk(event.documentId),
      Team.findByPk(event.teamId),
    ]);
    if (!document || !team) {
      return;
    }

    // never send notifications for draft documents
    if (!document.publishedAt) {
      return;
    }

    // if the document was published less than a minute ago, don't send a
    // separate notification.
    if (
      event.name === "revisions.create" &&
      differenceInMilliseconds(document.updatedAt, document.publishedAt) <
        Minute
    ) {
      return;
    }

    const integration = (await Integration.findOne({
      where: {
        teamId: document.teamId,
        collectionId: document.collectionId,
        service: IntegrationService.Slack,
        type: IntegrationType.Post,
        events: {
          [Op.contains]: [
            event.name === "revisions.create" ? "documents.update" : event.name,
          ],
        },
      },
    })) as Integration<IntegrationType.Post>;
    if (!integration) {
      return;
    }
    let text = `${document.updatedBy.name} updated "${document.title}"`;

    if (event.name === "documents.publish") {
      text = `${document.createdBy.name} published "${document.title}"`;
    }
    if (event.name === "documents.move") {
      const [parentDocument, parentCollection] = await Promise.all([
        Document.findByPk(document.parentDocumentId),
        Collection.findByPk(document.collectionId),
      ]);
      console.log("parentDocument object", JSON.stringify(parentDocument));
      console.log("parentCollection object", JSON.stringify(parentCollection));

      // text = `${document.createdBy.name} moved a document ${
      //   parentCollection.name ? `to Collection: ${parentCollection.name}` : ""
      // } ${parentDocument ? `under Document: ${parentDocument.title}` : ""}`;

      text = `${document.createdBy.name} moved a document
      Collection Name: ${parentCollection?.name}
      Collection ID: ${parentCollection?.id}
      parentDocument ID: ${parentDocument?.id}
      parentDocument title: ${parentDocument?.title}
      Document ID: ${document?.id}
      Document title: ${document?.title}
      `;

      if (env.ODOO_WEBHOOK_ENDPOINT) {
        console.log(
          "documentUpdated ODOO_WEBHOOK_ENDPOINT:",
          env.ODOO_WEBHOOK_ENDPOINT
        );
        const encoded = btoa(
          JSON.stringify({
            id: document.id,
            outlineType: "document",
            source: "outline",
            eventType: "parentChanged",
            value: {
              parentDocumentId: parentDocument?.id,
            },
          })
        );
        console.log("documentUpdated encoded:", encoded);
        const headers = {
          "Content-Type": "application/json",
        };
        if (env.ODOO_WEBHOOK_TOKEN) {
          // headers["Auth"] = env.ODOO_WEBHOOK_TOKEN;
        }

        console.log("documentUpdated headers:", headers);

        const response = await fetch(env.ODOO_WEBHOOK_ENDPOINT, {
          method: "POST",
          headers,
          body: encoded,
        });
        console.log("documentUpdated response:", response);
      }
    }

    console.log("documentUpdated integration:", integration.settings.url);

    await fetch(integration.settings.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        attachments: [
          presentMessageAttachment(document, team, document.collection),
        ],
      }),
    });
  }
}
