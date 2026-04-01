import * as zod from 'zod';

export const graphqlRequestSchema = zod.object({
	operationName: zod.string().min(1),
	variables: zod.record(zod.string(), zod.unknown()),
	query: zod.string().min(1),
});

export const deliveriesOrdersListFilteredVariablesSchema = zod.object({
	pageSize: zod.number().int().positive(),
	after: zod.string().min(1).optional(),
	archived: zod.boolean().optional(),
});

export const deliveriesOrdersListFilteredRequestSchema = graphqlRequestSchema
	.extend({
		operationName: zod.literal('DeliveriesOrdersListFiltered'),
		variables: deliveriesOrdersListFilteredVariablesSchema,
	})
	.refine((value) => value.query.includes('query DeliveriesOrdersListFiltered'), {
		path: ['query'],
		message: 'Expected a DeliveriesOrdersListFiltered GraphQL query.',
	});

const moneyV2Schema = zod.object({
	amount: zod.string(),
	currencyCode: zod.string(),
	__typename: zod.string().optional(),
});

const imageSchema = zod.object({
	url: zod.string().url(),
	altText: zod.string().nullable().optional(),
	height: zod.number().int().nullable().optional(),
	width: zod.number().int().nullable().optional(),
	sensitive: zod.boolean().optional(),
	thumbhash: zod.string().nullable().optional(),
	__typename: zod.string().optional(),
});

const carrierInfoSchema = zod.object({
	id: zod.string(),
	name: zod.string(),
	imageUrl: zod.string().url().nullable().optional(),
	__typename: zod.string().optional(),
});

const trackerSchema = zod.object({
	id: zod.string(),
	carrierInfo: carrierInfoSchema.nullable().optional(),
	__typename: zod.string().optional(),
});

const exceptionSchema = zod.object({
	id: zod.string(),
	exceptionType: zod.string(),
	__typename: zod.string().optional(),
});

const pickupLocationSchema = zod.object({
	id: zod.string(),
	pickupEta: zod.string().nullable().optional(),
	__typename: zod.string().optional(),
});

const etaInfoSchema = zod.object({
	formattedEtaDateAndTime: zod.string().nullable().optional(),
	branded: zod.boolean().nullable().optional(),
	__typename: zod.string().optional(),
});

const shopSchema = zod.object({
	id: zod.string(),
	uuid: zod.string(),
	name: zod.string(),
	nativeProductPagesEnabled: zod.boolean().optional(),
	shopifyId: zod.string().nullable().optional(),
	shopFacts: zod
		.union([
			zod.object({
				title: zod.string().nullable().optional(),
				description: zod.string().nullable().optional(),
				__typename: zod.string().optional(),
			}),
			zod.array(
				zod.object({
					title: zod.string().nullable().optional(),
					description: zod.string().nullable().optional(),
					__typename: zod.string().optional(),
				}),
			),
		])
		.nullable()
		.optional(),
	visualTheme: zod
		.object({
			id: zod.string(),
			logoImage: imageSchema.nullable().optional(),
			__typename: zod.string().optional(),
		})
		.nullable()
		.optional(),
	__typename: zod.string().optional(),
});

const deliveryNodeSchema = zod.object({
	__typename: zod.literal('Delivery'),
	id: zod.string(),
	status: zod.string().nullable().optional(),
	state: zod.string().nullable().optional(),
	customName: zod.string().nullable().optional(),
	deliveryName: zod.string().nullable().optional(),
	sellerName: zod.string().nullable().optional(),
	deliveredAt: zod.string().nullable().optional(),
	deliveryFlags: zod.array(zod.string()).optional(),
	deliveryMethodType: zod.string().nullable().optional(),
	pickupLocation: pickupLocationSchema.nullable().optional(),
	etaInfo: etaInfoSchema.nullable().optional(),
	exceptions: zod.array(exceptionSchema).optional(),
	deliveryLineItems: zod
		.array(
			zod.object({
				lineItem: zod
					.object({
						id: zod.string(),
						image: imageSchema.nullable().optional(),
						__typename: zod.string().optional(),
					})
					.nullable()
					.optional(),
				__typename: zod.string().optional(),
			}),
		)
		.optional(),
	order: zod
		.object({
			id: zod.string(),
			uuid: zod.string(),
			totalItemCount: zod.number().int().nullable().optional(),
			effectiveTotalPrice: moneyV2Schema.nullable().optional(),
			shop: shopSchema.nullable().optional(),
			__typename: zod.string().optional(),
		})
		.nullable()
		.optional(),
	tracker: trackerSchema.nullable().optional(),
});

const orderNodeSchema = zod.object({
	__typename: zod.literal('Order'),
	id: zod.string(),
	uuid: zod.string(),
	name: zod.string().nullable().optional(),
	loading: zod.boolean().optional(),
	isShopifyOrder: zod.boolean().optional(),
	shippingMethod: zod.string().nullable().optional(),
	canBuyAgain: zod.boolean().optional(),
	displayStatus: zod.string().nullable().optional(),
	isStale: zod.boolean().optional(),
	deliveryType: zod.string().nullable().optional(),
	lineItems: zod
		.object({
			nodes: zod.array(
				zod.object({
					id: zod.string(),
					reviewableStatus: zod.string().nullable().optional(),
					productTitle: zod.string().nullable().optional(),
					image: imageSchema.nullable().optional(),
					__typename: zod.string().optional(),
				}),
			),
			__typename: zod.string().optional(),
		})
		.optional(),
	deliveries: zod
		.object({
			nodes: zod.array(
				zod.object({
					id: zod.string(),
					status: zod.string().nullable().optional(),
					deliveredAt: zod.string().nullable().optional(),
					deliveryFlags: zod.array(zod.string()).optional(),
					customName: zod.string().nullable().optional(),
					deliveryName: zod.string().nullable().optional(),
					sellerName: zod.string().nullable().optional(),
					deliveryMethodType: zod.string().nullable().optional(),
					pickupLocation: pickupLocationSchema.nullable().optional(),
					etaInfo: etaInfoSchema.nullable().optional(),
					tracker: trackerSchema.nullable().optional(),
					brandedPromises: zod
						.array(
							zod.object({
								id: zod.string(),
								handle: zod.string().nullable().optional(),
								maximumEstimatedDeliveryTime: zod.string().nullable().optional(),
								formattedPromisedDeliveryDate: zod.string().nullable().optional(),
								logoUrl: zod.string().url().nullable().optional(),
								status: zod.string().nullable().optional(),
								eligibleAmount: moneyV2Schema.nullable().optional(),
								__typename: zod.string().optional(),
							}),
						)
						.optional(),
					exceptions: zod.array(exceptionSchema).optional(),
					__typename: zod.string().optional(),
				}),
			),
			__typename: zod.string().optional(),
		})
		.optional(),
	effectiveTotalPrice: moneyV2Schema.nullable().optional(),
	totalPriceAfterOfferApplied: moneyV2Schema.nullable().optional(),
	totalPrice: moneyV2Schema.nullable().optional(),
	orderPayments: zod
		.array(
			zod.object({
				id: zod.string(),
				paymentMethod: zod.string().nullable().optional(),
				__typename: zod.string().optional(),
			}),
		)
		.optional(),
	displayAsPastOrder: zod.boolean().optional(),
	deliveryStatus: zod.string().nullable().optional(),
	markedAsDelivered: zod.boolean().optional(),
	markedAsDeliveredAt: zod.string().nullable().optional(),
	canUndoMarkAsDelivered: zod.boolean().optional(),
	paymentStatus: zod.string().nullable().optional(),
	archived: zod.boolean().optional(),
	createdAt: zod.string().nullable().optional(),
	totalItemCount: zod.number().int().nullable().optional(),
	shop: shopSchema.nullable().optional(),
});

const deliveriesOrdersListNodeSchema = zod.discriminatedUnion('__typename', [
	orderNodeSchema,
	deliveryNodeSchema,
]);

export const deliveriesOrdersListFilteredDataSchema = zod.object({
	deliveriesOrdersList: zod.object({
		pageInfo: zod.object({
			hasNextPage: zod.boolean(),
			endCursor: zod.string().nullable(),
			__typename: zod.string().optional(),
		}),
		nodes: zod.array(deliveriesOrdersListNodeSchema),
		__typename: zod.string().optional(),
	}).nullable().optional(),
	accounts: zod.array(
		zod.object({
			id: zod.string(),
			primary: zod.boolean(),
			__typename: zod.string().optional(),
		}),
	),
	customerSatisfactionShopAppTrackingExperience: zod.object({
		userSampledForSurvey: zod.boolean(),
		__typename: zod.string().optional(),
	}),
});

export const deliveriesOrdersListFilteredResponseSchema = zod.object({
	data: deliveriesOrdersListFilteredDataSchema,
});

export type GraphqlRequest = zod.infer<typeof graphqlRequestSchema>;
export type DeliveriesOrdersListFilteredVariables = zod.infer<
	typeof deliveriesOrdersListFilteredVariablesSchema
>;
export type DeliveriesOrdersListFilteredRequest = zod.infer<
	typeof deliveriesOrdersListFilteredRequestSchema
>;
export type DeliveriesOrdersListFilteredData = zod.infer<
	typeof deliveriesOrdersListFilteredDataSchema
>;
export type DeliveriesOrdersListFilteredResponse = zod.infer<
	typeof deliveriesOrdersListFilteredResponseSchema
>;