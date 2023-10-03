import { toJS } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import Comment from "~/models/Comment";
import ConfirmationDialog from "~/components/ConfirmationDialog";
import Text from "~/components/Text";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";
import useToasts from "~/hooks/useToasts";

type Props = {
  comment: Comment;
  onSubmit?: () => void;
};

function CommentReOpenDialog({ comment, onSubmit }: Props) {
  const { comments } = useStores();
  const user = useCurrentUser();
  const { showToast } = useToasts();
  const { t } = useTranslation();
  const hasChildComments = comments.inThread(comment.id).length > 1;

  const handleSubmit = async () => {
    try {
      await comment.reopen(user);
      onSubmit?.();
    } catch (err) {
      showToast(err.message, { type: "error" });
    }
  };

  return (
    <ConfirmationDialog
      onSubmit={handleSubmit}
      submitText={t("I’m sure – Re-open")}
      savingText={`${t("Reopening")}…`}
      danger
    >
      <Text type="secondary">
        {hasChildComments ? (
          <Trans>
            Are you sure you want to re-open this entire comment thread?
          </Trans>
        ) : (
          <Trans>Are you sure you want to re-open this comment?</Trans>
        )}
      </Text>
    </ConfirmationDialog>
  );
}

export default observer(CommentReOpenDialog);
