import { z } from "zod";

import { isStrongPassword, MIN_PASSWORD_LENGTH_MESSAGE } from "../password-rules";
import { emailField, nameField, numericId } from "./request-security";
export const passwordField = z.string().max(72).refine(isStrongPassword, MIN_PASSWORD_LENGTH_MESSAGE);
export const registrationSchema = z
  .object({ username: nameField, email: emailField, password: passwordField })
  .strict();
export const profileSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update-username"), username: nameField }).strict(),
  z.object({ action: z.literal("update-language"), language: z.enum(["en", "ar"]) }).strict(),
  z
    .object({
      action: z.literal("change-password"),
      currentPassword: z.string().min(1).max(1024),
      newPassword: passwordField,
      confirmNewPassword: z.string().max(72),
    })
    .strict(),
]);
export const adminCreateSchema = z
  .object({
    name: nameField,
    email: emailField,
    password: passwordField,
    role: z.enum(["ADMIN", "USER"]).default("USER"),
  })
  .strict();
export const adminUpdateSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update-user"),
      id: numericId,
      name: nameField,
      email: emailField,
      role: z.enum(["ADMIN", "USER"]).optional(),
    })
    .strict(),
  z.object({ action: z.literal("set-role"), id: numericId, role: z.enum(["ADMIN", "USER"]) }).strict(),
  z.object({ action: z.literal("reset-password"), id: numericId, newPassword: passwordField }).strict(),
]);
