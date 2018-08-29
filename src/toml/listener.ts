/**
 * Listener for TOML files.
 * Filters active editor files according to the extension.
 */
import {
  TextEditor,
  TextEditorDecorationType,
  window,
  workspace,
  commands,
} from "vscode";
import { parse, filterCrates, Item } from "../toml/parser";
import { statusBarItem } from "../ui/indicators";
import { decorate } from "./decorations";
import { status } from "./commands";
import { versions } from "../api";

export interface Dependency {
  item: Item;
  versions: Array<string>;
  error: string;
}

let decoration: TextEditorDecorationType;

function parseToml(text: string): Item[] {
  console.log("Parsing...");
  const toml = parse(text);
  const tomlDependencies = filterCrates(toml.values);
  statusBarItem.setText("Cargo.toml parsed");
  return tomlDependencies;
}

function fetchCrateVersions(
  dependencies: Item[],
  shouldListPreRels: boolean,
): Promise<Dependency[]> {
  statusBarItem.setText("👀 Fetching crates.io");
  const responses = dependencies.map(
    (item: Item): Dependency => {
      return versions(item.key)
        .then((json: any) => {
          return {
            item,
            versions: json.versions.reduce((result: any[], item: any) => {
              const isPreRelease =
                !shouldListPreRels && item.num.indexOf("-") !== -1;
              if (!item.yanked && !isPreRelease) {
                result.push(item.num);
              }
              return result;
            }, []),
          };
        })
        .catch((error: Error) => {
          console.error(error);
          statusBarItem.setText(`⚠️ Fetch Error for ${item.key}`);
          return { item, error };
        });
    },
  );
  return Promise.all(responses);
}

function decorateVersions(editor: TextEditor, dependencies: Array<Dependency>) {
  if (decoration) {
    decoration.dispose();
  }
  const errors: Array<string> = [];
  const filtered = dependencies.filter((dep: Dependency) => {
    if (dep && !dep.error) {
      return dep;
    }
    errors.push(`${dep.item.key}`);
  });
  decoration = decorate(editor, filtered);
  if (errors.length) {
    window
      .showErrorMessage(`Fetch Errors:  ${errors.join(" , ")}`, "Retry")
      .then(action => {
        commands.executeCommand("crates.retry");
      });
    statusBarItem.setText("⚠️ Completed with errors");
  } else {
    statusBarItem.setText("OK");
  }
}

function parseAndDecorate(editor: TextEditor) {
  const text = editor.document.getText();
  const config = workspace.getConfiguration("", editor.document.uri);
  const shouldListPreRels = config.get("crates.listPreReleases");

  try {
    // Parse
    const dependencies = parseToml(text);

    // Fetch Versions
    fetchCrateVersions(dependencies, !!shouldListPreRels).then(
      decorateVersions.bind(undefined, editor),
    );
  } catch (e) {
    console.error(e);
    statusBarItem.setText("Cargo.toml is not valid!");
    window.showErrorMessage(`Cargo.toml is not valid! ${JSON.stringify(e)}`);
    if (decoration) {
      decoration.dispose();
    }
  }
}

export default function(editor: TextEditor | undefined): void {
  if (editor) {
    const { fileName } = editor.document;
    if (fileName.toLocaleLowerCase().endsWith("cargo.toml")) {
      status.inProgress = true;
      status.replaceItems = [];
      statusBarItem.show();
      parseAndDecorate(editor);
    } else {
      statusBarItem.hide();
    }
    status.inProgress = false;
  } else {
    console.log("No active editor found.");
  }
}
