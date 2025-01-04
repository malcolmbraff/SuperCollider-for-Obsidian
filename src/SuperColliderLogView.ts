import { ItemView, WorkspaceLeaf } from "obsidian";

export const LOG_VIEW_TYPE = "supercollider-log-view";

export class SuperColliderLogView extends ItemView {
    private logContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return LOG_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "SuperCollider Log";
    }

    async onOpen() {
        this.contentEl.empty();

        // Create a container for logs
        this.logContainer = this.contentEl.createEl("div", {
            cls: "supercollider-log-container",
        });

        // Apply global styles to make the log container scrollable and text selectable
        Object.assign(this.logContainer.style, {
            overflowY: "auto",
            height: "100%",
            padding: "10px",
            whiteSpace: "pre-wrap", // Preserve formatting
            fontFamily: "monospace", // Monospace font for logs
            userSelect: "text", // Enable text selection
            cursor: "text", // Use text cursor for better UX
        });
    }

    async onClose() {
        this.contentEl.empty();
        this.logContainer = null;
    }

    addLog(message: string) {
        if (this.logContainer) {
            // Add the actual log message
            const logItem = this.logContainer.createEl("div", {
                text: message,
                cls: "supercollider-log-item",
            });
    
            // Add a margin or padding between messages
            logItem.style.marginTop = "10px";
    
            // Ensure the log panel scrolls to the bottom
            this.logContainer.scrollTo({ top: this.logContainer.scrollHeight, behavior: "smooth" });
        }
    }
}