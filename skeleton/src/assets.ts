import fs from "node:fs";
import path from "node:path";

export class AssetMap {
    private readonly assets: Record<string, string>;

    public constructor() {
        try {
            const raw = fs.readFileSync(path.join(process.cwd(), "asset-manifest.json"), "utf-8");
            this.assets = JSON.parse(raw);
        } catch {
            throw new Error("Manifest file not found");
        }
    }

    public get(asset: string): string {
        if (!this.assets[asset]) {
            throw new Error(`Asset ${asset} not found`);
        }

        return this.assets[asset];
    }
}
