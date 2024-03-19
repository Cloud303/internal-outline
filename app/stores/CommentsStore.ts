import { User } from "@sentry/react";
import orderBy from "lodash/orderBy";
import { action, computed } from "mobx";
import Comment from "~/models/Comment";
import { client } from "~/utils/ApiClient";
import RootStore from "./RootStore";
import Store from "./base/Store";

export default class CommentsStore extends Store<Comment> {
  constructor(rootStore: RootStore) {
    super(rootStore, Comment);
  }

  /**
   * Returns a list of comments in a document that are not replies to other
   * comments.
   *
   * @param documentId ID of the document to get comments for
   * @returns Array of comments
   */
  threadsInDocument(documentId: string): Comment[] {
    return this.filter(
      (comment: Comment) =>
        comment.documentId === documentId && !comment.parentCommentId
    );
  }

  /**
   * Returns a list of comments that are replies to the given comment.
   *
   * @param commentId ID of the comment to get replies for
   * @returns Array of comments
   */
  inThread(threadId: string): Comment[] {
    return this.filter(
      (comment: Comment) =>
        comment.parentCommentId === threadId || comment.id === threadId
    );
  }

  @action
  setTyping({
    commentId,
    userId,
  }: {
    commentId: string;
    userId: string;
  }): void {
    const comment = this.get(commentId);
    if (comment) {
      comment.typingUsers.set(userId, new Date());
    }
  }

  @computed
  get orderedData(): Comment[] {
    return orderBy(Array.from(this.data.values()), "createdAt", "asc");
  }

  @action
  async resolveComment(
    params: {
      id: string;
      resolvedBy: User;
    },
    options?: {
      publish?: boolean;
      done?: boolean;
      autosave?: boolean;
    }
  ) {
    try {
      this.isSaving = true;
      await client.post(`/${this.apiEndpoint}.update`, {
        ...params,
        ...options,
        apiVersion: 2,
      });
      return this.remove(params.id);
    } finally {
      this.isSaving = false;
    }
  }

  async reopenComment(
    params: {
      id: string;
      resolvedBy: User;
    },
    options?: {
      publish?: boolean;
      done?: boolean;
      autosave?: boolean;
    }
  ) {
    try {
      this.isSaving = true;
      await client.post(`/${this.apiEndpoint}.update`, {
        ...params,
        ...options,
        apiVersion: 2,
        reopen: {
          reopen: true,
        },
      });
      return this.remove(params.id);
    } finally {
      this.isSaving = false;
    }
  }
}
