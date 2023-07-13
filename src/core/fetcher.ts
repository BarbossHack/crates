import Item from "./Item";
import Dependency from "./Dependency";
import { statusBarItem } from "../ui/indicators";
import {
  versions as loVersions,
} from "../api/crates-server-index";
import compareVersions from "../semver/compareVersions";
import { CompletionItem, CompletionItemKind, CompletionList } from "vscode";
import { sortText } from "../providers/autoCompletion";

export function fetchCrateVersions(
  dependencies: Item[],
  shouldListPreRels: boolean,
  localIndexHash?: string,
  localGitBranch?: string
): [Promise<Dependency[]>, Map<string, Dependency[]>] {
  statusBarItem.setText("👀 Fetching crates.io");

  const versions = loVersions;

  let responsesMap: Map<string, Dependency[]> = new Map();

  const responses = dependencies.map(
    (item: Item): Promise<Dependency> => {
      return versions(item.key).then((crate: any) => {
        const versions = crate.versions.reduce((result: any[], item: string) => {
          const isPreRelease = !shouldListPreRels && item.indexOf("-") !== -1;
          if (!isPreRelease)
            result.push(item);
          return result;
        }, [])
          .sort(compareVersions)
          .reverse();

        let i = 0;
        const versionCompletionItems = new CompletionList(
          versions.map((version: string) => {
            const completionItem = new CompletionItem(
              version,
              CompletionItemKind.Class
            );
            completionItem.preselect = i === 0;
            completionItem.sortText = sortText(i++);
            return completionItem;
          }),
          true
        );

        let featureCompletionItems: Map<string, CompletionList> = new Map();
        crate.features?.forEach((feature: string) => {
          // TODO: Add feature completion items according to the different versions.
          featureCompletionItems!.set(feature, new CompletionList(crate.features.map((feature: string) => {
            return new CompletionItem(feature, CompletionItemKind.Class);
          })));
        });
        return {
          item,
          versions,
          versionCompletionItems,
          featureCompletionItems,
        };
      });

      // Check settings and if local registry enabled control cargo home. Fallback is the github index.
      return versions(item.key)
        .then((json: any) => {
          const versions = json.versions
            .reduce((result: any[], item: any) => {
              const isPreRelease = !shouldListPreRels && item.num.indexOf("-") !== -1;
              if (!item.yanked && !isPreRelease)
                result.push(item.num);
              return result;
            }, [])
            .sort(compareVersions)
            .reverse();

          let i = 0;
          const versionCompletionItems = new CompletionList(
            versions.map((version: string) => {
              const completionItem = new CompletionItem(
                version,
                CompletionItemKind.Class
              );
              completionItem.preselect = i === 0;
              completionItem.sortText = sortText(i++);
              return completionItem;
            }),
            true
          );

          let featureCompletionItems: Map<string, CompletionList> = new Map();
          json.versions.forEach((item: any) => {
            if (item.features.length > 0) {
              const isPreRelease = !shouldListPreRels && item.num.indexOf("-") !== -1;
              if (!item.yanked && !isPreRelease) {
                featureCompletionItems!.set(item.num, new CompletionList(item.features.map((feature: string) => {
                  return new CompletionItem(feature, CompletionItemKind.Class);
                })));
              }
            }
          });

          return {
            item,
            versions,
            versionCompletionItems,
            featureCompletionItems,
          };
        })
        .then((dependency: Dependency) => {
          const found = responsesMap.get(item.key);
          if (found) {
            found.push(dependency);
          } else {
            responsesMap.set(item.key, [dependency]);
          }
          return dependency;
        })
        .catch((error: Error) => {
          console.error(error);
          return {
            item,
            error: item.key + ": " + error,
          };
        });
    }
  );

  return [Promise.all(responses), responsesMap];
}
