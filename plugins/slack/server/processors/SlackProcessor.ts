/* eslint-disable no-console */
import crypto from "crypto";
import { differenceInMilliseconds } from "date-fns";
import { Op } from "sequelize";
import { IntegrationService, IntegrationType } from "@shared/types";
import { Minute } from "@shared/utils/time";
import { Document, Integration, Collection, Team } from "@server/models";
import BaseProcessor from "@server/queues/processors/BaseProcessor";
import {
  DocumentEvent,
  IntegrationEvent,
  RevisionEvent,
  Event,
} from "@server/types";
import fetch from "@server/utils/fetch";
import { sleep } from "@server/utils/timers";
import env from "../env";
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
        // wait a few seconds to give the document summary chance to be generated
        await sleep(5000);
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

      text = `${document.createdBy.name} moved a document
      Collection Name: ${parentCollection?.name}
      Collection ID: ${parentCollection?.id}
      parentDocument ID: ${parentDocument?.id}
      parentDocument title: ${parentDocument?.title}
      Document ID: ${document?.id}
      Document title: ${document?.title}
      `;

      if (env.ODOO_WEBHOOK_ENDPOINT) {
        const requestPayload = JSON.stringify({
          id: document.id,
          outlineType: "document",
          source: "outline",
          eventType: "parentChanged",
          value: {
            parentDocumentId: parentDocument?.id,
          },
        });
        const encoded = btoa(requestPayload);
        const headers = {
          "Content-Type": "application/json",
        };

        if (env.ODOO_WEBHOOK_SECRET) {
          const hash = crypto
            .createHmac("sha256", env.ODOO_WEBHOOK_SECRET)
            .update(requestPayload);
          const TokenHexHash = hash.digest("hex");
          headers["Authorization"] = `HMAC-SHA256 Signature=${TokenHexHash}`;
        }

        const response = await fetch(env.ODOO_WEBHOOK_ENDPOINT, {
          method: "POST",
          headers,
          body: encoded,
        });
        console.log("documentUpdated response:", response);
      }
    }

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
