import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import fs from "fs/promises";
import path from "path";
import type { ZodType } from "zod";
import type { logger as LogType } from "..";
import * as ZTypes from "./shop.zod";
import { z } from "zod";

const DELIVERIES_ORDERS_LIST_FILTERED_QUERY = `query DeliveriesOrdersListFiltered($pageSize: Int!, $after: String, $archived: Boolean) {
  deliveriesOrdersList(
    first: $pageSize
    after: $after
    filter: {archived: $archived}
  ) {
    pageInfo {
      hasNextPage
      endCursor
      __typename
    }
    nodes {
      id
      ... on Order {
        __typename
        id
        uuid
        name
        loading
        isShopifyOrder
        shippingMethod
        canBuyAgain
        displayStatus
        isStale
        deliveryType
        lineItems {
          nodes {
            id
            reviewableStatus
            productTitle
            image {
              url
              __typename
            }
            __typename
          }
          __typename
        }
        deliveries {
          nodes {
            id
            status
            deliveredAt
            deliveryFlags
            customName
            deliveryName: name
            sellerName
            deliveryMethodType
            pickupLocation {
              id
              pickupEta
              __typename
            }
            etaInfo {
              formattedEtaDateAndTime
              branded
              __typename
            }
            tracker {
              id
              carrierInfo {
                id
                name
                imageUrl
                __typename
              }
              __typename
            }
            brandedPromises {
              id
              __typename
              handle
              maximumEstimatedDeliveryTime
              formattedPromisedDeliveryDate
              logoUrl
              status
              eligibleAmount {
                amount
                currencyCode
                __typename
              }
            }
            exceptions {
              id
              exceptionType
              __typename
            }
            __typename
          }
          __typename
        }
        effectiveTotalPrice {
          amount
          currencyCode
          __typename
        }
        totalPriceAfterOfferApplied {
          amount
          currencyCode
          __typename
        }
        totalPrice {
          amount
          currencyCode
          __typename
        }
        orderPayments {
          id
          paymentMethod
          __typename
        }
        displayAsPastOrder
        deliveryStatus
        markedAsDelivered
        markedAsDeliveredAt
        canUndoMarkAsDelivered
        paymentStatus
        archived
        createdAt
        totalItemCount
        shop {
          id
          uuid
          name
          nativeProductPagesEnabled
          shopifyId
          shopFacts {
            title
            description
            __typename
          }
          visualTheme {
            id
            logoImage {
              url
              altText
              height
              width
              sensitive
              thumbhash
              __typename
            }
            __typename
          }
          __typename
        }
      }
      ... on Delivery {
        __typename
        id
        status
        state
        customName
        deliveryName: name
        sellerName
        deliveredAt
        deliveryFlags
        deliveryMethodType
        pickupLocation {
          id
          pickupEta
          __typename
        }
        etaInfo {
          formattedEtaDateAndTime
          branded
          __typename
        }
        exceptions {
          id
          exceptionType
          __typename
        }
        deliveryLineItems: lineItems {
          lineItem {
            id
            image {
              url
              __typename
            }
            __typename
          }
          __typename
        }
        order {
          id
          uuid
          totalItemCount
          effectiveTotalPrice {
            amount
            currencyCode
            __typename
          }
          shop {
            id
            uuid
            name
            visualTheme {
              id
              logoImage {
                url
                altText
                height
                width
                sensitive
                thumbhash
                __typename
              }
              __typename
            }
            __typename
          }
          __typename
        }
        tracker {
          id
          carrierInfo {
            id
            name
            imageUrl
            __typename
          }
          __typename
        }
      }
      __typename
    }
    __typename
  }
  accounts {
    id
    primary
    __typename
  }
  customerSatisfactionShopAppTrackingExperience {
    userSampledForSurvey
    __typename
  }
}`;

const REFRESH_ACCESS_TOKEN_MUTATION = `mutation RefreshAccessToken($refreshToken: String!) {
  accessTokenRefresh(refreshToken: $refreshToken) {
    authPayload {
      accessToken
      refreshToken
      expiresIn
      __typename
    }
    userErrors {
      message
      __typename
    }
    __typename
  }
}`;

export default class Shop {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;
  private accessToken: string;
  private refreshToken: string;
  private readonly envPath: string;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(apiKey: string, refreshToken: string, logtape: typeof LogType) {
    if (!apiKey) throw new Error("Shop API Key is required");
    if (!refreshToken) throw new Error("Shop refresh token is required");

    this.accessToken = apiKey;
    this.refreshToken = refreshToken;
    this.envPath = path.join(process.cwd(), ".env");
    this.fetch = axios.create({
      baseURL: "https://server.shop.app/graphql",
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    this.logger = logtape;
    this.ready = Promise.resolve();
  }

  private updateAuthorizationHeader(accessToken: string) {
    this.fetch.defaults.headers.common["Authorization"] = `Bearer ${accessToken}`;
  }

  private async persistTokensToEnv(accessToken: string, refreshToken: string) {
    try {
      const content = await fs.readFile(this.envPath, "utf-8");
      const lines = content.split(/\r?\n/);

      let hasShopToken = false;
      let hasRefreshToken = false;

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";

        if (line.startsWith("SHOP_TOKEN=")) {
          lines[i] = `SHOP_TOKEN=${accessToken}`;
          hasShopToken = true;
        }
        if (line.startsWith("SHOP_REFRESH_TOKEN=")) {
          lines[i] = `SHOP_REFRESH_TOKEN=${refreshToken}`;
          hasRefreshToken = true;
        }
      }

      if (!hasShopToken) {
        lines.push(`SHOP_TOKEN=${accessToken}`);
      }
      if (!hasRefreshToken) {
        lines.push(`SHOP_REFRESH_TOKEN=${refreshToken}`);
      }

      await fs.writeFile(this.envPath, lines.join("\n"));
    } catch (error) {
      this.logger.error("Failed to persist refreshed tokens to .env", {
        error,
      });
    }

    process.env["SHOP_TOKEN"] = accessToken;
    process.env["SHOP_REFRESH_TOKEN"] = refreshToken;
  }

  private isGraphqlAuthError(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;
    const maybeErrors = (data as { errors?: Array<{ message?: unknown }> }).errors;
    if (!Array.isArray(maybeErrors)) return false;

    return maybeErrors.some((errorItem) => {
      const message =
        typeof errorItem?.message === "string"
          ? errorItem.message.toLowerCase()
          : "";
      return (
        message.includes("token") ||
        message.includes("auth") ||
        message.includes("unauthorized") ||
        message.includes("expired")
      );
    });
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const payload = ZTypes.refreshAccessTokenRequestSchema.parse({
          operationName: "RefreshAccessToken",
          variables: {
            refreshToken: this.refreshToken,
          },
          query: REFRESH_ACCESS_TOKEN_MUTATION,
        });

        const response = await axios.request({
          baseURL: "https://server.shop.app/graphql",
          timeout: 10000,
          method: "POST",
          data: payload,
        });

        const parsed = ZTypes.refreshAccessTokenResponseSchema.parse(response.data);
        const accessTokenRefresh = parsed.data?.accessTokenRefresh;
        const userErrors = accessTokenRefresh?.userErrors ?? [];
        if (userErrors.length > 0) {
          this.logger.error("RefreshAccessToken returned userErrors", {
            error: userErrors,
          });
          return false;
        }

        const authPayload = accessTokenRefresh?.authPayload;
        if (!authPayload) {
          this.logger.error("RefreshAccessToken did not return authPayload");
          return false;
        }

        this.accessToken = authPayload.accessToken;
        this.refreshToken = authPayload.refreshToken;
        this.updateAuthorizationHeader(this.accessToken);
        await this.persistTokensToEnv(this.accessToken, this.refreshToken);
        this.logger.info("Shop token refreshed successfully");
        return true;
      } catch (error) {
        this.logger.error("Failed to refresh Shop access token", {
          error,
        });
        return false;
      }
    })();

    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async request<S extends ZodType<any, any, any>>(
    config: AxiosRequestConfig,
    schema: S,
    allowRefresh = true,
  ): Promise<
    | { ok: true; status: number; data: z.infer<S> }
    | { ok: false; status: number | null; msg: string | unknown }
  > {
    await this.ready;

    try {
      const res = await this.fetch.request(config);
      this.lastCode = res.status;

      if (allowRefresh && this.isGraphqlAuthError(res.data)) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.request(config, schema, false);
        }
      }

      try {
        return {
          ok: true,
          status: res.status,
          data: schema.parse(res.data),
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          this.logger.error("Zod validation failed", {
            error: error.issues,
          });
          return { ok: false, status: res.status, msg: error.issues };
        } else {
          this.logger.error("Unknown parsing error", {
            error,
          });
          return { ok: false, status: res.status, msg: error };
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        let status = err.response?.status ?? err.status ?? null;

        if (
          allowRefresh &&
          (status === 401 || status === 403 || this.isGraphqlAuthError(err.response?.data))
        ) {
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            return this.request(config, schema, false);
          }
        }

        if (
          (!status && err.code === "ECONNABORTED") ||
          (!status && err.message === "timeout of 10000ms exceeded")
        ) {
          status = 408;
        }
        this.lastCode = status;
        return { ok: false, status, msg: err.message };
      }

      return { ok: false, status: null, msg: err };
    }
  }

  deliveriesOrdersListFiltered(
    variables: z.infer<typeof ZTypes.deliveriesOrdersListFilteredVariablesSchema>,
  ) {
    const parsedVariables =
      ZTypes.deliveriesOrdersListFilteredVariablesSchema.parse(variables);

    const payload = ZTypes.deliveriesOrdersListFilteredRequestSchema.parse({
      operationName: "DeliveriesOrdersListFiltered",
      variables: parsedVariables,
      query: DELIVERIES_ORDERS_LIST_FILTERED_QUERY,
    });

    return this.request(
      {
        method: "POST",
        data: payload,
      },
      ZTypes.deliveriesOrdersListFilteredResponseSchema,
    );
  }
}
