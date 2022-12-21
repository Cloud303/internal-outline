import { debounce } from "lodash";
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { AllSelection } from "prosemirror-state";
import * as React from "react";
import { WithTranslation, withTranslation } from "react-i18next";
import {
  Prompt,
  Route,
  RouteComponentProps,
  StaticContext,
  withRouter,
  Redirect,
} from "react-router";
import styled from "styled-components";
import breakpoint from "styled-components-breakpoint";
import { Heading } from "@shared/editor/lib/getHeadings";
import { parseDomain } from "@shared/utils/domains";
import getTasks from "@shared/utils/getTasks";
import RootStore from "~/stores/RootStore";
import Document from "~/models/Document";
import Revision from "~/models/Revision";
import DocumentMove from "~/scenes/DocumentMove";
import Branding from "~/components/Branding";
import ConnectionStatus from "~/components/ConnectionStatus";
import ErrorBoundary from "~/components/ErrorBoundary";
import Flex from "~/components/Flex";
import LoadingIndicator from "~/components/LoadingIndicator";
import Modal from "~/components/Modal";
import PageTitle from "~/components/PageTitle";
import PlaceholderDocument from "~/components/PlaceholderDocument";
import RegisterKeyDown from "~/components/RegisterKeyDown";
import withStores from "~/components/withStores";
import type { Editor as TEditor } from "~/editor";
import { NavigationNode } from "~/types";
import { client } from "~/utils/ApiClient";
import { emojiToUrl } from "~/utils/emoji";
import { isModKey } from "~/utils/keyboard";
import {
  documentMoveUrl,
  documentHistoryUrl,
  editDocumentUrl,
  documentUrl,
  updateDocumentUrl,
} from "~/utils/routeHelpers";
import Container from "./Container";
import Contents from "./Contents";
import Editor from "./Editor";
import Header from "./Header";
import KeyboardShortcutsButton from "./KeyboardShortcutsButton";
import MarkAsViewed from "./MarkAsViewed";
import Notices from "./Notices";
import PublicReferences from "./PublicReferences";
import References from "./References";

const AUTOSAVE_DELAY = 3000;

type Params = {
  documentSlug: string;
  revisionId?: string;
  shareId?: string;
};

type LocationState = {
  title?: string;
  restore?: boolean;
  revisionId?: string;
};

type Props = WithTranslation &
  RootStore &
  RouteComponentProps<Params, StaticContext, LocationState> & {
    sharedTree?: NavigationNode;
    abilities: Record<string, any>;
    document: Document;
    revision?: Revision;
    readOnly: boolean;
    shareId?: string;
    onCreateLink?: (title: string) => Promise<string>;
    onSearchLink?: (term: string) => any;
  };

@observer
class DocumentScene extends React.Component<Props> {
  @observable
  editor = React.createRef<TEditor>();

  @observable
  isUploading = false;

  @observable
  isSaving = false;

  @observable
  isPublishing = false;

  @observable
  isEditorDirty = false;

  @observable
  isEmpty = true;

  @observable
  coverImg =
    "data:image/jpeg;base64,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";

  @observable
  lastRevision: number = this.props.document.revision;

  @observable
  title: string = this.props.document.title;

  @observable
  headings: Heading[] = [];

  getEditorText: () => string = () => this.props.document.text;

  componentDidMount() {
    this.updateIsDirty();
  }

  componentDidUpdate(prevProps: Props) {
    const { auth, document, t } = this.props;

    if (prevProps.readOnly && !this.props.readOnly) {
      this.updateIsDirty();
    }

    if (this.props.readOnly || auth.team?.collaborativeEditing) {
      this.lastRevision = document.revision;
    }

    if (
      !this.props.readOnly &&
      !auth.team?.collaborativeEditing &&
      prevProps.document.revision !== this.lastRevision
    ) {
      if (auth.user && document.updatedBy.id !== auth.user.id) {
        this.props.toasts.showToast(
          t(`Document updated by {{userName}}`, {
            userName: document.updatedBy.name,
          }),
          {
            timeout: 30 * 1000,
            type: "warning",
            action: {
              text: "Reload",
              onClick: () => {
                window.location.href = documentUrl(document);
              },
            },
          }
        );
      }
    }
  }

  componentWillUnmount() {
    if (
      this.isEmpty &&
      this.props.document.createdBy.id === this.props.auth.user?.id &&
      this.props.document.isDraft &&
      this.props.document.isActive &&
      this.props.document.hasEmptyTitle &&
      this.props.document.isPersistedOnce
    ) {
      this.props.document.delete();
    }
  }

  replaceDocument = (template: Document | Revision) => {
    const editorRef = this.editor.current;

    if (!editorRef) {
      return;
    }

    const { view, parser } = editorRef;
    view.dispatch(
      view.state.tr
        .setSelection(new AllSelection(view.state.doc))
        .replaceSelectionWith(parser.parse(template.text))
    );

    this.isEditorDirty = true;

    if (template instanceof Document) {
      this.props.document.templateId = template.id;
    }

    if (!this.title) {
      this.title = template.title;
      this.props.document.title = template.title;
    }

    this.props.document.text = template.text;
    this.updateIsDirty();
    this.onSave({
      autosave: true,
      publish: false,
      done: false,
    });
  };

  onSynced = async () => {
    const { toasts, history, location, t } = this.props;
    const restore = location.state?.restore;
    const revisionId = location.state?.revisionId;
    const editorRef = this.editor.current;

    if (!editorRef || !restore) {
      return;
    }

    const response = await client.post("/revisions.info", {
      id: revisionId,
    });

    if (response) {
      this.replaceDocument(response.data);
      toasts.showToast(t("Document restored"));
      history.replace(this.props.document.url, history.location.state);
    }
  };

  goToMove = (ev: KeyboardEvent) => {
    if (!this.props.readOnly) {
      return;
    }
    ev.preventDefault();
    const { document, abilities } = this.props;

    if (abilities.move) {
      this.props.history.push(documentMoveUrl(document));
    }
  };

  goToEdit = (ev: KeyboardEvent) => {
    if (!this.props.readOnly) {
      return;
    }
    ev.preventDefault();
    const { document, abilities } = this.props;

    if (abilities.update) {
      this.props.history.push(editDocumentUrl(document));
    }
  };

  goToHistory = (ev: KeyboardEvent) => {
    if (!this.props.readOnly) {
      return;
    }
    if (ev.ctrlKey) {
      return;
    }
    ev.preventDefault();
    const { document, location } = this.props;

    if (location.pathname.endsWith("history")) {
      this.props.history.push(document.url);
    } else {
      this.props.history.push(documentHistoryUrl(document));
    }
  };

  onPublish = (ev: React.MouseEvent | KeyboardEvent) => {
    ev.preventDefault();
    const { document } = this.props;
    if (document.publishedAt) {
      return;
    }
    this.onSave({
      publish: true,
      done: true,
    });
  };

  onToggleTableOfContents = (ev: KeyboardEvent) => {
    if (!this.props.readOnly) {
      return;
    }
    ev.preventDefault();
    const { ui } = this.props;

    if (ui.tocVisible) {
      ui.hideTableOfContents();
    } else {
      ui.showTableOfContents();
    }
  };

  onSave = async (
    options: {
      done?: boolean;
      publish?: boolean;
      autosave?: boolean;
    } = {}
  ) => {
    const { document } = this.props;
    // prevent saves when we are already saving
    if (document.isSaving) {
      return;
    }

    // get the latest version of the editor text value
    const text = this.getEditorText ? this.getEditorText() : document.text;

    // prevent save before anything has been written (single hash is empty doc)
    if (text.trim() === "" && document.title.trim() === "") {
      return;
    }

    document.text = text;
    document.tasks = getTasks(document.text);

    // prevent autosave if nothing has changed
    if (options.autosave && !this.isEditorDirty && !document.isDirty()) {
      return;
    }

    this.isSaving = true;
    this.isPublishing = !!options.publish;

    try {
      const savedDocument = await document.save({
        ...options,
        lastRevision: this.lastRevision,
      });

      this.isEditorDirty = false;
      this.lastRevision = savedDocument.revision;

      if (options.done) {
        this.props.history.push(savedDocument.url);
        this.props.ui.setActiveDocument(savedDocument);
      } else if (document.isNew) {
        this.props.history.push(editDocumentUrl(savedDocument));
        this.props.ui.setActiveDocument(savedDocument);
      }
    } catch (err) {
      this.props.toasts.showToast(err.message, {
        type: "error",
      });
    } finally {
      this.isSaving = false;
      this.isPublishing = false;
    }
  };

  autosave = debounce(() => {
    this.onSave({
      done: false,
      autosave: true,
    });
  }, AUTOSAVE_DELAY);

  updateIsDirty = () => {
    const { document } = this.props;
    const editorText = this.getEditorText().trim();
    this.isEditorDirty = editorText !== document.text.trim();

    // a single hash is a doc with just an empty title
    this.isEmpty =
      (!editorText || editorText === "#" || editorText === "\\") && !this.title;
  };

  updateIsDirtyDebounced = debounce(this.updateIsDirty, 500);

  onFileUploadStart = () => {
    this.isUploading = true;
  };

  onFileUploadStop = () => {
    this.isUploading = false;
  };

  onChange = (getEditorText: () => string) => {
    const { document, auth } = this.props;
    this.getEditorText = getEditorText;

    // Keep derived task list in sync
    const tasks = this.editor.current?.getTasks();
    const total = tasks?.length ?? 0;
    const completed = tasks?.filter((t) => t.completed).length ?? 0;
    document.updateTasks(total, completed);

    // If the multiplayer editor is enabled we're done here as changes are saved
    // through the persistence protocol. The rest of this method is legacy.
    if (auth.team?.collaborativeEditing) {
      return;
    }

    // document change while read only is presumed to be a checkbox edit,
    // in that case we don't delay in saving for a better user experience.
    if (this.props.readOnly) {
      this.updateIsDirty();
      this.onSave({
        done: false,
        autosave: true,
      });
    } else {
      this.updateIsDirtyDebounced();
      this.autosave();
    }
  };

  onHeadingsChange = (headings: Heading[]) => {
    this.headings = headings;
  };

  onChangeTitle = action((value: string) => {
    this.title = value;
    this.props.document.title = value;
    this.updateIsDirty();
    this.autosave();
  });

  goBack = () => {
    if (!this.props.readOnly) {
      this.props.history.push(this.props.document.url);
    }
  };

  handleCoverImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.coverImg =
      e?.target?.files !== null
        ? URL.createObjectURL(e?.target?.files[0])
        : this.coverImg;
  };

  render() {
    const {
      document,
      revision,
      readOnly,
      abilities,
      auth,
      ui,
      shareId,
      t,
    } = this.props;
    const team = auth.team;
    const isShare = !!shareId;
    const value = revision ? revision.text : document.text;
    const embedsDisabled =
      (team && team.documentEmbeds === false) || document.embedsDisabled;

    const hasHeadings = this.headings.length > 0;
    const showContents =
      ui.tocVisible &&
      ((readOnly && hasHeadings) || team?.collaborativeEditing);
    const collaborativeEditing =
      team?.collaborativeEditing &&
      !document.isArchived &&
      !document.isDeleted &&
      !revision &&
      !isShare;

    const canonicalUrl = shareId
      ? this.props.match.url
      : updateDocumentUrl(this.props.match.url, document);

    return (
      <ErrorBoundary>
        {this.props.location.pathname !== canonicalUrl && (
          <Redirect
            to={{
              pathname: canonicalUrl,
              state: this.props.location.state,
              hash: this.props.location.hash,
            }}
          />
        )}
        <RegisterKeyDown trigger="m" handler={this.goToMove} />
        <RegisterKeyDown trigger="e" handler={this.goToEdit} />
        <RegisterKeyDown trigger="Escape" handler={this.goBack} />
        <RegisterKeyDown trigger="h" handler={this.goToHistory} />
        <RegisterKeyDown
          trigger="p"
          handler={(event) => {
            if (isModKey(event) && event.shiftKey) {
              this.onPublish(event);
            }
          }}
        />
        <RegisterKeyDown
          trigger="h"
          handler={(event) => {
            if (event.ctrlKey && event.altKey) {
              this.onToggleTableOfContents(event);
            }
          }}
        />
        <Background key={revision ? revision.id : document.id} column auto>
          <Route
            path={`${document.url}/move`}
            component={() => (
              <Modal
                title={`Move ${document.noun}`}
                onRequestClose={this.goBack}
                isOpen
              >
                <DocumentMove
                  document={document}
                  onRequestClose={this.goBack}
                />
              </Modal>
            )}
          />
          <PageTitle
            title={document.titleWithDefault.replace(document.emoji || "", "")}
            favicon={document.emoji ? emojiToUrl(document.emoji) : undefined}
          />
          {(this.isUploading || this.isSaving) && <LoadingIndicator />}
          <Container justify="center" column auto>
            {!readOnly && (
              <>
                <Prompt
                  when={
                    this.isEditorDirty &&
                    !this.isUploading &&
                    !team?.collaborativeEditing
                  }
                  message={(location, action) => {
                    if (
                      // a URL replace matching the current document indicates a title change
                      // no guard is needed for this transition
                      action === "REPLACE" &&
                      location.pathname === editDocumentUrl(document)
                    ) {
                      return true;
                    }

                    return t(
                      `You have unsaved changes.\nAre you sure you want to discard them?`
                    ) as string;
                  }}
                />
                <Prompt
                  when={this.isUploading && !this.isEditorDirty}
                  message={t(
                    `Images are still uploading.\nAre you sure you want to discard them?`
                  )}
                />
              </>
            )}
            <Header
              document={document}
              documentHasHeadings={hasHeadings}
              shareId={shareId}
              isRevision={!!revision}
              isDraft={document.isDraft}
              isEditing={!readOnly && !team?.collaborativeEditing}
              isSaving={this.isSaving}
              isPublishing={this.isPublishing}
              publishingIsDisabled={
                document.isSaving || this.isPublishing || this.isEmpty
              }
              savingIsDisabled={document.isSaving || this.isEmpty}
              sharedTree={this.props.sharedTree}
              onSelectTemplate={this.replaceDocument}
              onSave={this.onSave}
              headings={this.headings}
              handleCoverImg={this.handleCoverImg}
            />
            <div
              style={{
                backgroundImage: `url(${this.coverImg})`,
                backgroundSize: "cover",
                width: "100%",
                height: "20rem",
              }}
            ></div>
            <MaxWidth
              archived={document.isArchived}
              showContents={showContents}
              isEditing={!readOnly}
              isFullWidth={document.fullWidth}
              column
              auto
            >
              <Notices document={document} readOnly={readOnly} />

              <React.Suspense fallback={<PlaceholderDocument />}>
                <Flex auto={!readOnly}>
                  {showContents && (
                    <Contents
                      headings={this.headings}
                      isFullWidth={document.fullWidth}
                    />
                  )}
                  <Editor
                    id={document.id}
                    key={embedsDisabled ? "disabled" : "enabled"}
                    ref={this.editor}
                    multiplayer={collaborativeEditing}
                    shareId={shareId}
                    isDraft={document.isDraft}
                    template={document.isTemplate}
                    title={revision ? revision.title : document.title}
                    document={document}
                    value={readOnly ? value : undefined}
                    defaultValue={value}
                    embedsDisabled={embedsDisabled}
                    onSynced={this.onSynced}
                    onFileUploadStart={this.onFileUploadStart}
                    onFileUploadStop={this.onFileUploadStop}
                    onSearchLink={this.props.onSearchLink}
                    onCreateLink={this.props.onCreateLink}
                    onChangeTitle={this.onChangeTitle}
                    onChange={this.onChange}
                    onHeadingsChange={this.onHeadingsChange}
                    onSave={this.onSave}
                    onPublish={this.onPublish}
                    onCancel={this.goBack}
                    readOnly={readOnly}
                    readOnlyWriteCheckboxes={readOnly && abilities.update}
                  >
                    {shareId && (
                      <ReferencesWrapper isOnlyTitle={document.isOnlyTitle}>
                        <PublicReferences
                          shareId={shareId}
                          documentId={document.id}
                          sharedTree={this.props.sharedTree}
                        />
                      </ReferencesWrapper>
                    )}
                    {!isShare && !revision && (
                      <>
                        <MarkAsViewed document={document} />
                        <ReferencesWrapper isOnlyTitle={document.isOnlyTitle}>
                          <References document={document} />
                        </ReferencesWrapper>
                      </>
                    )}
                  </Editor>
                </Flex>
              </React.Suspense>
            </MaxWidth>
            {isShare && !parseDomain(window.location.origin).custom && (
              <Branding href="//www.getoutline.com?ref=sharelink" />
            )}
          </Container>
        </Background>
        {!isShare && (
          <>
            <KeyboardShortcutsButton />
            <ConnectionStatus />
          </>
        )}
      </ErrorBoundary>
    );
  }
}

const Background = styled(Container)`
  background: ${(props) => props.theme.background};
  transition: ${(props) => props.theme.backgroundTransition};
`;

const ReferencesWrapper = styled.div<{ isOnlyTitle?: boolean }>`
  margin-top: ${(props) => (props.isOnlyTitle ? -45 : 16)}px;

  @media print {
    display: none;
  }
`;

type MaxWidthProps = {
  isEditing?: boolean;
  isFullWidth?: boolean;
  archived?: boolean;
  showContents?: boolean;
};

const MaxWidth = styled(Flex)<MaxWidthProps>`
  // Adds space to the gutter to make room for heading annotations
  padding: 0 32px;
  transition: padding 100ms;
  max-width: 100vw;
  width: 100%;

  padding-bottom: 16px;

  ${breakpoint("tablet")`
    padding: 0 44px;
    margin: 4px auto 12px;
    max-width: ${(props: MaxWidthProps) =>
      props.isFullWidth
        ? "100vw"
        : `calc(64px + 46em + ${props.showContents ? "256px" : "0px"});`}
  `};

  ${breakpoint("desktopLarge")`
    max-width: ${(props: MaxWidthProps) =>
      props.isFullWidth ? "100vw" : `calc(64px + 52em);`}
  `};
`;

export default withTranslation()(withStores(withRouter(DocumentScene)));
