import {
    Disposable,
    EventEmitter,
    TextEditor,
    Uri,
    WorkspaceFolder,
    window,
    workspace,
} from "vscode";
import {CustomWhenContext} from "./CustomWhenContext";
import {StateStorage} from "./StateStorage";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";

export class WorkspaceFolderManager implements Disposable {
    private logger = NamedLogger.getOrCreate(Loggers.Extension);
    private disposables: Disposable[] = [];
    private _activeWorkspaceFolder: WorkspaceFolder | undefined =
        workspace.workspaceFolders?.[0];
    private _activeProjectUri: Uri | undefined =
        workspace.workspaceFolders?.[0]?.uri;
    private readonly didChangeActiveProjectFolder = new EventEmitter<
        Uri | undefined
    >();
    public readonly onDidChangeActiveProjectFolder =
        this.didChangeActiveProjectFolder.event;

    constructor(
        private readonly customWhenContext: CustomWhenContext,
        private readonly stateStorage: StateStorage
    ) {
        const activeProjectPath = this.stateStorage.get(
            "databricks.activeProjectPath"
        );
        if (activeProjectPath) {
            const uri = Uri.file(activeProjectPath);
            const folder = workspace.getWorkspaceFolder(uri);
            if (folder) {
                this._activeProjectUri = uri;
                this._activeWorkspaceFolder = folder;
            }
        }
        this.logger.log("Active project:", this._activeProjectUri?.fsPath);
        this.logger.log(
            "Active workspace:",
            this._activeWorkspaceFolder?.uri.fsPath
        );

        this.disposables.push(
            workspace.onDidChangeWorkspaceFolders((e) => {
                if (
                    e.removed.find(
                        (v) =>
                            v.uri.fsPath ===
                            this._activeWorkspaceFolder?.uri.fsPath
                    ) ||
                    this._activeWorkspaceFolder === undefined
                ) {
                    const folder = workspace.workspaceFolders?.[0];
                    if (folder) {
                        this.setActiveProjectFolder(folder.uri, folder);
                    }
                }
            }),
            window.onDidChangeActiveTextEditor((editor) => {
                this.setIsActiveFileInActiveProject(editor);
            }),
            this.onDidChangeActiveProjectFolder(() => {
                this.setIsActiveFileInActiveProject(window.activeTextEditor);
            })
        );

        this.setIsActiveFileInActiveProject(window.activeTextEditor);
    }

    private setIsActiveFileInActiveProject(activeEditor?: TextEditor) {
        const isActiveFileInActiveWorkspace =
            this.activeProjectUri !== undefined &&
            activeEditor !== undefined &&
            activeEditor.document.uri.fsPath.startsWith(
                this.activeProjectUri?.fsPath
            );
        this.customWhenContext.setIsActiveFileInActiveWorkspace(
            isActiveFileInActiveWorkspace
        );
    }

    get activeProjectUri() {
        if (this._activeProjectUri === undefined) {
            throw new Error("No active project folder");
        }

        return this._activeProjectUri;
    }

    get activeWorkspaceFolder() {
        if (this._activeWorkspaceFolder === undefined) {
            throw new Error("No active workspace folder");
        }

        return this._activeWorkspaceFolder;
    }

    setActiveProjectFolder(
        projectFolder: Uri,
        workspaceFolder: WorkspaceFolder
    ) {
        if (
            this._activeProjectUri?.fsPath === projectFolder?.fsPath &&
            this._activeWorkspaceFolder?.uri.fsPath ===
                workspaceFolder.uri.fsPath
        ) {
            return;
        }

        this._activeWorkspaceFolder = workspaceFolder;
        this._activeProjectUri = projectFolder;
        this.stateStorage.set(
            "databricks.activeProjectPath",
            projectFolder.fsPath
        );
        this.didChangeActiveProjectFolder.fire(projectFolder);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
