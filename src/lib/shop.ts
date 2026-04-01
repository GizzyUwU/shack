import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
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

export default class Shop {
  lastCode: number | null = null;
  private fetch: AxiosInstance;
  private ready: Promise<void>;
  private logger: typeof LogType;

  constructor(apiKey: string, logtape: typeof LogType) {
    if (!apiKey) throw new Error("Shop API Key is required");
    this.fetch = axios.create({
      baseURL: "https://server.shop.app/graphql",
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    this.logger = logtape;
    this.ready = Promise.resolve();
  }

  private async request<S extends ZodType<any, any, any>>(
    config: AxiosRequestConfig,
    schema: S,
  ): Promise<
    | { ok: true; status: number; data: z.infer<S> }
    | { ok: false; status: number | null; msg: string | unknown }
  > {
    await this.ready;

    try {
      const res = await this.fetch.request(config);
      this.lastCode = res.status;
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

        if (!status && err.code === "ECONNABORTED" || !status && err.message === "timeout of 10000ms exceeded") {
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
