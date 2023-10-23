import { IIIFRC } from "../util/get-config.ts";
import { Collection } from "@iiif/presentation-3";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { compileReverseSlugConfig } from "../util/slug-engine.ts";

export function create(folderPath: string) {
  const endpoints = {
    slugs: join(folderPath, "config/slugs.json"),
    stores: join(folderPath, "config/stores.json"),
    collection: join(folderPath, "collection.json"),
    editable: join(folderPath, "meta", "editable.json"),
    indices: join(folderPath, "meta", "indices.json"),
    "manifests.db": join(folderPath, "meta", "manifests.db"),
    manifests: join(folderPath, "manifests/collection.json"),
    overrides: join(folderPath, "meta", "overrides.json"),
    sitemap: join(folderPath, "meta", "sitemap.json"),
    top: join(folderPath, "collections", "collection.json"),
    topics: join(folderPath, "topics/collection.json"),
  };
  const cache: Record<string, any> = {};
  const cachedGet = async <T>(filePath: string): Promise<T> => {
    if (cache[filePath]) {
      return cache[filePath];
    }
    const res = await readFile(filePath);
    const json = JSON.parse(res.toString());
    cache[filePath] = json;
    return json;
  };

  const getSlugs = () => cachedGet<IIIFRC["slugs"]>(endpoints.slugs);
  const getStores = () => cachedGet<IIIFRC["stores"]>(endpoints.stores);
  const getManifests = () => cachedGet<Collection>(endpoints.manifests);
  const getTop = () => cachedGet<Collection>(endpoints.top);
  const getEditable = () =>
    cachedGet<Record<string, string>>(endpoints.editable);

  const getOverrides = () =>
    cachedGet<Record<string, string>>(endpoints.overrides);
  const getSitemap = () =>
    cachedGet<
      Record<
        string,
        {
          type: string;
          source:
            | { type: "disk"; path: string }
            | { type: "remote"; url: string };
        }
      >
    >(endpoints.sitemap);

  async function resolveFromSlug(slug: string, type?: string) {
    const slugs = await getSlugs();
    const slugFns = Object.fromEntries(
      Object.entries(slugs || {})
        .map(([key, value]) => {
          if (type && value.type !== type) {
            return null as any;
          }
          return [
            key,
            { info: value, matches: compileReverseSlugConfig(value) },
          ];
        })
        .filter((t) => t !== null),
    );

    for (const slugFn of Object.values(slugFns || {})) {
      const [matches] = slugFn.matches(slug);
      if (matches) {
        return matches;
      }
    }
  }

  async function loadTopicType(name: string) {
    const pathToTopic = join(folderPath, "topics", name);

    return {
      collection: join(pathToTopic, "collection.json"),
      meta: join(pathToTopic, "meta.json"),
    };
  }
  async function loadTopic(type: string, name: string) {
    const pathToTopic = join(folderPath, "topics", type, name);

    return {
      collection: join(pathToTopic, "collection.json"),
      meta: join(pathToTopic, "meta.json"),
    };
  }

  async function loadManifest(url: string) {
    const overrides = await getOverrides();
    const urlWithoutSlash = url.startsWith("/") ? url.slice(1) : url;
    if (overrides && overrides[urlWithoutSlash]) {
      url = "/" + overrides[urlWithoutSlash].replace("manifest.json", "");
    }

    const remote = await resolveFromSlug(url, "Manifest");
    if (remote) {
      return {
        id: remote,
        meta: join(folderPath, url, "meta.json"),
      };
    }

    if (!url.startsWith("/")) {
      url = `/${url}`;
    }

    return {
      id: `${url}/manifest.json`,
      meta: join(folderPath, url, "meta.json"),
      manifest: join(folderPath, url, "manifest.json"),
    };
  }

  return {
    endpoints,
    getSlugs,
    getStores,
    getManifests,
    getTop,
    getEditable,
    getOverrides,
    getSitemap,
    loadManifest,
    loadTopicType,
    loadTopic,
  };
}