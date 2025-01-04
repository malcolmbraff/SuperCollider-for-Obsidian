import { Plugin, PluginSettingTab, Setting, Notice, ItemView, WorkspaceLeaf } from "obsidian";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

// Constants for the log view type
export const LOG_VIEW_TYPE = "SuperCollider-log-view";

// Plugin settings interface
interface SuperColliderPluginSettings {
  sclangPath: string; // Existing property
  logPanelLocation: "right" | "below"; // Restrict to supported options
}

// Default settings
const DEFAULT_SETTINGS: SuperColliderPluginSettings = {
  sclangPath: "/Applications/SuperCollider.app/Contents/MacOS/sclang", // Default path for macOS
  logPanelLocation: "below", // Default panel location
};

export default class SuperColliderPlugin extends Plugin {
  settings!: SuperColliderPluginSettings;
  sclangProcess: ChildProcessWithoutNullStreams | null = null;
  logView: SuperColliderLogView | null = null;

  async onload() {
    await this.loadSettings();

    // Register the custom log view
    this.registerView(LOG_VIEW_TYPE, (leaf) => new SuperColliderLogView(leaf));

    // Add a ribbon icon to toggle sclang and open the log panel
    this.addRibbonIcon("codesandbox", "Toggle SuperCollider", async () => {
      if (this.sclangProcess) {
        this.stopSclang();
        this.closeLogView();
      } else {
        this.startSclang();
        this.activateLogView();
      }
    });

    // Dynamically load CSS
    const cssPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/styles.css`;
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.type = "text/css";
    cssLink.href = cssPath;

    document.head.appendChild(cssLink);

    // Add command to send a single line
    this.addCommand({
      id: "run-supercollider-code",
      name: "Run SuperCollider Code",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const lineText = editor.getLine(cursor.line).trim();
        if (lineText) {
          this.runSuperColliderCode(lineText);
        } else {
          new Notice("No code on the current line to run.");
        }
      },
    });

    // Add command to evaluate a block
    this.addCommand({
      id: "evaluate-supercollider-block",
      name: "Evaluate SuperCollider Block",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const lines = editor.getValue().split("\n");

        let blockStart = cursor.line;
        let blockEnd = cursor.line;

        // Find the start of the block
        while (blockStart > 0 && !lines[blockStart].trim().startsWith("(")) {
          blockStart--;
        }

        // Find the end of the block
        while (blockEnd < lines.length && !lines[blockEnd].trim().endsWith(")")) {
          blockEnd++;
        }

        // Extract and process the block
        const block = lines.slice(blockStart, blockEnd + 1)
          .map(line => line.replace(/\/\/.*$/g, "").trim()) // Remove single-line comments
          .filter(line => line.length > 0) // Remove empty lines
          .join(" "); // Combine into a single line

        if (block) {
          this.runSuperColliderCode(block);
        } else {
          new Notice("No block detected.");
        }
      },
    });

    // Add command to send CmdPeriod.run;
    this.addCommand({
      id: "send-cmdperiod",
      name: "Send CmdPeriod Command",
      callback: () => {
        this.runSuperColliderCode("CmdPeriod.run;");
      },
    });

    // Add settings tab
    this.addSettingTab(new SuperColliderSettingTab(this));
  }

  onunload() {
    this.stopSclang();
    this.app.workspace.detachLeavesOfType(LOG_VIEW_TYPE);
  }

  startSclang() {
    if (this.sclangProcess) {
      return;
    }

    this.sclangProcess = spawn(this.settings.sclangPath, [], { shell: true });

    this.sclangProcess.stdout.on("data", (data) => {
      const message = data.toString();
      this.logView?.addLog(message);
    });

    this.sclangProcess.stderr.on("data", (data) => {
      const error = data.toString();
      this.logView?.addLog(`[Error]: ${error}`);
    });

    this.sclangProcess.on("close", () => {
      this.sclangProcess = null;
    });
  }

  stopSclang() {
    if (this.sclangProcess) {
      // Send CmdPeriod.run; to stop all running processes
      this.sclangProcess.stdin.write("CmdPeriod.run;\n");

      // Send s.quit; to properly shutdown the server
      this.sclangProcess.stdin.write("s.quit;\n");

      // Allow a small delay for the commands to process before killing the process
      setTimeout(() => {
        this.sclangProcess?.kill();
        this.sclangProcess = null;
      }, 100); // Adjust the timeout if needed
    }
  }

  async runSuperColliderCode(code: string) {
    if (!this.sclangProcess) {
      new Notice("sclang process is not running. Starting it now...");
      this.startSclang();
    }

    this.sclangProcess?.stdin.write(`${code}\n`);
  }

  async activateLogView() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) {
      new Notice("No active leaf available to split from.");
      return;
    }
  
    const direction = this.settings.logPanelLocation === "below" ? "horizontal" : "vertical";
  
    const newLeaf = this.app.workspace.createLeafBySplit(activeLeaf, direction, false);
  
    if (newLeaf) {
      await newLeaf.setViewState({
        type: LOG_VIEW_TYPE,
        active: true,
      });
      this.app.workspace.revealLeaf(newLeaf);
      const view = newLeaf.view as SuperColliderLogView;
      if (view) {
        this.logView = view;
      }
    } else {
      new Notice("Failed to create log panel.");
    }
  }

  async closeLogView() {
    this.app.workspace.detachLeavesOfType(LOG_VIEW_TYPE);
    this.logView = null;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// Settings tab class
class SuperColliderSettingTab extends PluginSettingTab {
  plugin: SuperColliderPlugin;

  constructor(plugin: SuperColliderPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
  
    containerEl.empty();
    containerEl.createEl("h2", { text: "SuperCollider Plugin Settings" });
  
    new Setting(containerEl)
      .setName("Path to sclang")
      .setDesc("Full path to the sclang executable.")
      .addText((text) =>
        text
          .setPlaceholder("Path to sclang")
          .setValue(this.plugin.settings.sclangPath)
          .onChange(async (value) => {
            this.plugin.settings.sclangPath = value;
            await this.plugin.saveSettings();
          })
      );
  
    new Setting(containerEl)
      .setName("Log Panel Location")
      .setDesc("Choose where the log panel appears (right or below).")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("right", "Right")
          .addOption("below", "Below")
          .setValue(this.plugin.settings.logPanelLocation)
          .onChange(async (value) => {
            this.plugin.settings.logPanelLocation = value as "right" | "below";
            await this.plugin.saveSettings();
          })
      );
  }
}

// Log view class
class SuperColliderLogView extends ItemView {
  logContainer: HTMLElement | null = null;

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
    this.containerEl.empty();
    this.logContainer = this.containerEl.createEl("div", {
      cls: "supercollider-log-container",
    });
    this.logContainer.style.overflowY = "auto";
    this.logContainer.style.height = "100%";
  }

  async onClose() {
    this.containerEl.empty();
    this.logContainer = null;
  }

  addLog(message: string) {
    if (this.logContainer) {
      const logItem = this.logContainer.createEl("div", {
        text: message,
        cls: "supercollider-log-item",
      });
      this.logContainer.scrollTo({ top: this.logContainer.scrollHeight, behavior: "smooth" });
    }
  }
}