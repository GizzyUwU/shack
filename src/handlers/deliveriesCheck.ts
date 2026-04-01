import type { RequestHandler } from "..";
import type { DeliveriesOrdersListFilteredResponse } from "../lib/shop.zod";
import fs from "fs/promises";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), "./cache/deliveryCache.json");

type CachedDeliveryStatus = {
    id: string;
    status: string | null;
    etaInfo: {
        formattedEtaDateAndTime: string | null;
    } | null;
    deliveredAt: string | null;
    deliveryName?: string | null;
};

async function loadCache(): Promise<Map<string, CachedDeliveryStatus>> {
    try {
        const data = await fs.readFile(CACHE_FILE, "utf-8");
        const parsed = JSON.parse(data) as Record<string, CachedDeliveryStatus>;
        return new Map(Object.entries(parsed));
    } catch {
        return new Map();
    }
}

async function saveCache(cache: Map<string, CachedDeliveryStatus>): Promise<void> {
    try {
        const obj = Object.fromEntries(cache);
        await fs.writeFile(CACHE_FILE, JSON.stringify(obj, null, 2));
    } catch (err) {
        console.error("[deliveriesCheck] Failed to save cache", err);
    }
}

async function fetchAllNodes(ctx: RequestHandler) {
    const allNodes: any[] = [];
    let after: string | undefined;

    do {
        const res = await ctx.shopClient?.deliveriesOrdersListFiltered({
            pageSize: 10,
            archived: false,
            after
        });

        if (!res || !res.ok) {
            ctx.logger.warn("[deliveriesCheck] Failed to fetch deliveries/orders list", {
                data: {
                    status: res?.status ?? null,
                    message: res?.msg ?? "unknown",
                },
            });
            return null;
        }

        const deliveriesOrdersList = res.data.data.deliveriesOrdersList;
        if (!deliveriesOrdersList) {
            return null;
        }

        allNodes.push(...deliveriesOrdersList.nodes);

        const pageInfo = deliveriesOrdersList.pageInfo;
        after = pageInfo.hasNextPage ? pageInfo.endCursor ?? undefined : undefined;
    } while (after);

    return allNodes;
}

function getCurrentDeliveryStatuses(
    nodes: any[],
): CachedDeliveryStatus[] {
    return nodes
        .filter((node) => node.__typename === "Delivery" && node.state === "CURRENT")
        .map((node) => ({
            id: node.id,
            status: node.status ?? null,
            deliveryName: node.deliveryName ?? null,
            etaInfo: node.etaInfo
                ? {
                    formattedEtaDateAndTime: node.etaInfo.formattedEtaDateAndTime ?? null,
                }
                : null,
            deliveredAt: node.deliveredAt ?? null,
        }));
}

export default {
    name: "deliveriesCheck",
    async execute(ctx: RequestHandler) {
        if (!ctx.shopClient) {
            ctx.logger.warn("[deliveriesCheck] shopClient is not configured");
            return;
        }

        const nodes = await fetchAllNodes(ctx);
        if (!nodes) {
            return;
        }
        const currentDeliveries = getCurrentDeliveryStatuses(nodes);
        const deliveryStatusCache = await loadCache();

        if (deliveryStatusCache.size === 0) {
            for (const item of currentDeliveries) {
                deliveryStatusCache.set(item.id, item);
            }
            await saveCache(deliveryStatusCache);
            return;
        }

        const nextSnapshot = new Map<string, CachedDeliveryStatus>();
        for (const item of currentDeliveries) {
            nextSnapshot.set(item.id, item);
        }

        let hasChanges = false;
        const trackedIds = new Set<string>([
            ...deliveryStatusCache.keys(),
            ...nextSnapshot.keys(),
        ]);

        for (const id of trackedIds) {
            const previousData = deliveryStatusCache.get(id);
            const nextData = nextSnapshot.get(id);
            if (!previousData && nextData) {
                hasChanges = true;

                await ctx.client.chat.postMessage({
                    channel: process.env["CHANNEL"] ?? "",
                    text: `${nextData.deliveryName ?? "A delivery"} is now being tracked with status ${nextData.status}. ETA is ${nextData.etaInfo?.formattedEtaDateAndTime ?? "unknown"}`,
                })
                continue;
            }

            if (previousData && !nextData) {
                hasChanges = true;
                continue;
            }

            if (!previousData || !nextData) continue;

            const statusChanged = previousData.status !== nextData.status;
            const etaChanged =
                previousData.etaInfo?.formattedEtaDateAndTime !==
                nextData.etaInfo?.formattedEtaDateAndTime;

            if ((statusChanged || etaChanged) && process.env["CHANNEL"]) {
                hasChanges = true;

                if (statusChanged && nextData.status === "DELIVERED") {
                    await ctx.client.chat.postMessage({
                        channel: process.env["CHANNEL"] ?? "",
                        text: `${nextData.deliveryName} has been delivered! Delivery time was at ${nextData.deliveredAt}`,
                    })
                } else if (statusChanged) {
                    await ctx.client.chat.postMessage({
                        channel: process.env["CHANNEL"] ?? "",
                        text: `${nextData.deliveryName} changed status from ${previousData.status} to ${nextData.status}. ETA is ${nextData.etaInfo?.formattedEtaDateAndTime ?? "unknown"}`,
                    })
                }

                if (etaChanged) {
                    await ctx.client.chat.postMessage({
                        channel: process.env["CHANNEL"] ?? "",
                        text: `${nextData.deliveryName} changed ETA from ${previousData.etaInfo?.formattedEtaDateAndTime ?? "unknown"} to ${nextData.etaInfo?.formattedEtaDateAndTime ?? "unknown"}`,
                    })
                }
            }
        }

        if (!hasChanges) {
            return;
        }

        deliveryStatusCache.clear();
        for (const item of currentDeliveries) {
            deliveryStatusCache.set(item.id, item);
        }
        await saveCache(deliveryStatusCache);
    },
};
