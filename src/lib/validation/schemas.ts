import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(4, "Password is required"),
});

export const issueTokenSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(2, "Customer name is required")
      .max(100),
    contactNumber: z
      .string()
      .trim()
      .min(9, "Contact number is required")
      .max(15)
      .regex(/^[0-9+\-\s]+$/, "Invalid contact number"),
    /** Fleet vehicle id, or empty when optional / custom */
    vehicleId: z.string().optional().or(z.literal("")),
    /** When user chooses "Other", typed vehicle name */
    customVehicleName: z.string().trim().max(120).optional().or(z.literal("")),
    testDriveType: z
      .enum(["NORMAL", "VIP", "SCHEDULED", "WALK_IN"])
      .default("NORMAL"),
    nic: z.string().trim().max(20).optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .email("Invalid email")
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(500).optional().or(z.literal("")),
    counterId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const custom = (data.customVehicleName ?? "").trim();
    const vehicleId = (data.vehicleId ?? "").trim();
    if (vehicleId === "__other__" && custom.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Type the vehicle name",
        path: ["customVehicleName"],
      });
    }
  });

export const skipTokenSchema = z.object({
  tokenId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

export const cancelTokenSchema = z.object({
  tokenId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

export const settingsSchema = z.object({
  companyName: z.string().trim().min(2).max(100),
  tokenPrefix: z.string().trim().max(5).optional().or(z.literal("")),
  startingTokenNumber: z.number().int().min(1).max(9999),
  maxTokenNumber: z.number().int().min(1).max(9999),
  customerCodePrefix: z
    .string()
    .trim()
    .min(1)
    .max(3)
    .regex(/^[A-Za-z]+$/, "Customer code prefix must be letters"),
  defaultCounterId: z.string().min(1),
  audioNotificationEnabled: z.boolean(),
  textToSpeechEnabled: z.boolean(),
  displayMode: z.enum(["STANDARD", "COMPACT", "LARGE"]),
  autoCompleteOnNext: z.boolean(),
  upcomingTokensCount: z.number().int().min(1).max(10),
  displayShowCustomerName: z.boolean(),
});

export const vehicleSchema = z.object({
  brand: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(50),
  registrationNumber: z.string().trim().max(20).optional().or(z.literal("")),
  status: z.enum(["AVAILABLE", "IN_TEST_DRIVE", "MAINTENANCE", "UNAVAILABLE"]),
  active: z.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type IssueTokenFormInput = z.infer<typeof issueTokenSchema>;
export type SettingsFormInput = z.infer<typeof settingsSchema>;
export type VehicleFormInput = z.infer<typeof vehicleSchema>;
