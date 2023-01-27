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
import { useLocation } from "react-router-dom";
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
import usePolicy from "~/hooks/usePolicy";
import useStores from "~/hooks/useStores";
import { NavigationNode } from "~/types";
import { client } from "~/utils/ApiClient";
import { emojiToUrl } from "~/utils/emoji";
import { uploadFile } from "~/utils/files";
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
import Header from "./Header";
import KeyboardShortcutsButton from "./KeyboardShortcutsButton";
import MarkAsViewed from "./MarkAsViewed";
import Notices from "./Notices";
import PublicReferences from "./PublicReferences";
import References from "./References";
import Editor from "./TemplateEditor";

const AUTOSAVE_DELAY = 3000;

type Params = {
  documentSlug?: string;
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
class DocumentSceneTemplate extends React.Component<Props> {
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
  coverImg: string | void | null | unknown = null;

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
    // const { auth, document, t } = this.props;

    if (prevProps.readOnly && !this.props.readOnly) {
      this.updateIsDirty();
    }

    // if (this.props.readOnly || auth.team?.collaborativeEditing) {
    //   this.lastRevision = document.revision;
    // }

    // if (
    //   !this.props.readOnly &&
    //   !auth.team?.collaborativeEditing &&
    //   prevProps.document.revision !== this.lastRevision
    // ) {
    //   if (auth.user && document.updatedBy.id !== auth.user.id) {
    //     this.props.toasts.showToast(
    //       t(`Document updated by {{userName}}`, {
    //         userName: document.updatedBy.name,
    //       }),
    //       {
    //         timeout: 30 * 1000,
    //         type: "warning",
    //         action: {
    //           text: "Reload",
    //           onClick: () => {
    //             window.location.href = documentUrl(document);
    //           },
    //         },
    //       }
    //     );
    //   }
    // }
  }

  // componentWillUnmount() {
  //   if (
  //     this.isEmpty &&
  //     this.props.document.createdBy.id === this.props.auth.user?.id &&
  //     this.props.document.isDraft &&
  //     this.props.document.isActive &&
  //     this.props.document.hasEmptyTitle &&
  //     this.props.document.isPersistedOnce
  //   ) {
  //     this.props.document.delete();
  //   }
  // }

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
    const { document } = this.props;

    // if (abilities.move) {
    //   this.props.history.push(documentMoveUrl(document));
    // }
  };

  goToEdit = (ev: KeyboardEvent) => {
    if (!this.props.readOnly) {
      return;
    }
    ev.preventDefault();
    const { document } = this.props;

    // if (abilities.update) {
    //   this.props.history.push(editDocumentUrl(document));
    // }
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
    // const tasks = this.editor.current?.getTasks();
    // const total = tasks?.length ?? 0;
    // const completed = tasks?.filter((t) => t.completed).length ?? 0;
    // document.updateTasks(total, completed);

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

  // getBase64(file: any, cb: any) {
  //   let reader = new FileReader();
  //   reader.readAsDataURL(file);
  //   reader.onload = function () {
  //     cb(reader.result);
  //   };
  //   reader.onerror = function (error) {
  //     console.log("Error: ", error);
  //   };
  // }

  getBase64(file: any) {
    let document: string | ArrayBuffer | null = "";
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function () {
      document = reader.result;
    };
    reader.onerror = function (error) {
      console.log("Error: ", error);
    };

    return document;
  }

  render() {
    const { document, revision, readOnly, auth } = this.props;
    // const team = auth.team;
    // const isShare = !!shareId;
    const value = revision ? revision.text : document.text;
    const embedsDisabled = document.embedsDisabled;

    // const hasHeadings = this.headings.length > 0;
    // const showContents =
    //   ui.tocVisible &&
    //   ((readOnly && hasHeadings) || team?.collaborativeEditing);
    // const collaborativeEditing =
    //   team?.collaborativeEditing &&
    //   !document.isArchived &&
    //   !document.isDeleted &&
    //   !revision &&
    //   !isShare;

    // const canonicalUrl = shareId
    //   ? this.props.match.url
    //   : updateDocumentUrl(this.props.match.url, document);

    // const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    //   const file: any = e.target.files ? e.target.files[0] : null;

    //   this.coverImg =
    //     e?.target?.files !== null
    //       ? window.URL.createObjectURL(file)
    //       : this.coverImg;

    //   try {
    //     const attachment = await uploadFile(file, {
    //       name: file.name,
    //       public: true,
    //     });
    //     document.coverImg = attachment?.url;
    //     this.updateIsDirty();
    //     this.autosave();
    //   } catch (err) {
    //     console.log(err.message);
    //   }
    // };

    // const handleRemoveCoverImg = () => {
    //   this.coverImg = "";
    //   document.coverImg = "";

    //   this.updateIsDirty();
    //   this.autosave();
    // };

    console.log(document);

    return (
      <ErrorBoundary>
        {/* {this.props.location.pathname !== canonicalUrl && (
          <Redirect
            to={{
              pathname: canonicalUrl,
              state: this.props.location.state,
              hash: this.props.location.hash,
            }}
          />
        )} */}
        {/* <RegisterKeyDown trigger="m" handler={this.goToMove} />
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
        /> */}
        <React.Suspense fallback={<PlaceholderDocument />}>
          <Flex auto={true}>
            <Editor
              id={document.id}
              // key={embedsDisabled ? "disabled" : "enabled"}
              ref={this.editor}
              // multiplayer={collaborativeEditing}
              // shareId={shareId}
              isDraft={document.isDraft}
              template={false}
              // coverImg={this.coverImg ? this.coverImg : document.coverImg}
              // title={revision ? revision.title : document.title}
              document={document}
              value={value}
              defaultValue={value}
              embedsDisabled={embedsDisabled}
              onSynced={this.onSynced}
              onFileUploadStart={this.onFileUploadStart}
              onFileUploadStop={this.onFileUploadStop}
              onSearchLink={this.props.onSearchLink}
              onCreateLink={this.props.onCreateLink}
              onChangeTitle={this.onChangeTitle}
              onChange={this.onChange}
              // onHeadingsChange={this.onHeadingsChange}
              // onSave={this.onSave}
              // onPublish={this.onPublish}
              // onCancel={this.goBack}
              readOnly={readOnly}
              readOnlyWriteCheckboxes={true}
              // children={undefined}
            ></Editor>
          </Flex>
        </React.Suspense>
      </ErrorBoundary>
    );
  }
}

const DocumentTemplate = (props: any) => {
  const { ui, shares, documents, auth, revisions, subscriptions } = useStores();
  const location = useLocation<LocationState>();
  const { document, editor } = props;
  const { view } = editor;
  const { tr } = view.state;
  // const can = usePolicy(document?.id);

  console.log("LOCATION", location);

  const onCreateLink = React.useCallback(
    async (title: string) => {
      if (!document) {
        throw new Error("Document not loaded yet");
      }

      const newDocument = await documents.create({
        collectionId: document.collectionId,
        parentDocumentId: document.parentDocumentId,
        title,
        text: "",
      });

      return newDocument.url;
    },
    [document, documents]
  );

  return (
    // <DocumentSceneTemplate
    //   auth={auth}
    //   // abilities={can}
    //   documents={documents}
    //   shares={shares}
    //   subscriptions={subscriptions}
    //   revisions={revisions}
    //   ui={ui}
    //   document={document}
    //   location={location}
    //   onCreateLink={() => console.log("hello world")}
    // />
    <h1>hello</h1>
  );
};

export default withTranslation()(withStores(DocumentTemplate));
