"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Globe, Key, Mail, RefreshCw, ShieldAlert, ShieldCheck, Trash2, User, UserRoundPen, Users } from "lucide-react";
import { getSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { LanguageSwitcher } from "@/components/language-switcher";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeRole, USER_ROLES, type UserRole } from "@/lib/auth/roles";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { showErrorMessage, showSuccessMessage } from "@/lib/notifications";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH_MESSAGE } from "@/lib/password-rules";
import { cn } from "@/lib/utils";

type SessionState = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: UserRole | null;
    emailVerified?: string | null;
  };
} | null;

const SETTINGS_TABS = {
  PERSONAL_INFO: "personal-info",
  SYSTEM_USERS: "system-users",
  GENERAL: "general",
} as const;

type SettingsTab = (typeof SETTINGS_TABS)[keyof typeof SETTINGS_TABS];

function getTabFromQuery(tabQuery: string | null | undefined): SettingsTab | null {
  if (!tabQuery) return null;
  return Object.values(SETTINGS_TABS).includes(tabQuery as SettingsTab) ? (tabQuery as SettingsTab) : null;
}

type SystemSettingsContentProps = {
  mode?: "page" | "modal";
  tabQuery?: string | null;
};

type SystemUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: UserRole;
  emailVerified?: string | null;
};

export function SystemSettingsContent({ mode = "page", tabQuery }: SystemSettingsContentProps) {
  const { t } = useI18n();
  const passwordMinLengthMessage = t("settings.validation.passwordMinLength", { count: MIN_PASSWORD_LENGTH });

  const mapSettingsApiError = useCallback(
    (message: unknown, fallbackKey: TranslationKey) => {
      if (typeof message !== "string" || message.length === 0) return t(fallbackKey);
      if (message === "Unauthorized") return t("settings.validation.unauthorized");
      if (message === "Forbidden") return t("settings.validation.forbidden");
      if (message === "Username is required.") return t("settings.validation.usernameRequired");
      if (message === "Verification code is required.") return t("settings.validation.verificationCodeRequired");
      if (message === "All password fields are required.") return t("settings.validation.allPasswordFieldsRequired");
      if (message === "Confirm password does not match.") return t("settings.validation.passwordsMismatch");
      if (message === "Current password is incorrect.") return t("settings.validation.currentPasswordIncorrect");
      if (message === "Name, email, and password are required.")
        return t("settings.validation.nameEmailPasswordRequired");
      if (message === "Name and email are required.") return t("settings.validation.nameEmailRequired");
      if (message === "A user with this email already exists.") return t("settings.validation.userExists");
      if (message === "User not found.") return t("settings.validation.userNotFound");
      if (message === "A valid user id is required.") return t("settings.validation.userIdRequired");
      if (message === "You cannot change your own role.") return t("settings.cannotChangeOwnRole");
      if (message === "This admin account cannot be deleted because it is protected by email policy.") {
        return t("settings.validation.protectedAdminDelete");
      }
      if (message === MIN_PASSWORD_LENGTH_MESSAGE) return passwordMinLengthMessage;
      return t(fallbackKey);
    },
    [passwordMinLengthMessage, t],
  );

  const usernameSchema = useMemo(
    () =>
      z.object({
        username: z
          .string()
          .trim()
          .min(1, { message: t("settings.validation.usernameRequired") }),
      }),
    [t],
  );

  const verifyCodeSchema = useMemo(
    () =>
      z.object({
        code: z
          .string()
          .trim()
          .min(1, { message: t("settings.validation.verificationCodeRequired") }),
      }),
    [t],
  );

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, { message: t("settings.validation.currentPasswordRequired") }),
          newPassword: z
            .string()
            .min(1, { message: t("settings.validation.newPasswordRequired") })
            .min(MIN_PASSWORD_LENGTH, { message: passwordMinLengthMessage }),
          confirmNewPassword: z.string().min(1, { message: t("settings.validation.confirmPasswordRequired") }),
        })
        .refine((data) => data.newPassword === data.confirmNewPassword, {
          message: t("settings.validation.passwordsMismatch"),
          path: ["confirmNewPassword"],
        }),
    [passwordMinLengthMessage, t],
  );

  type UsernameFormValues = z.infer<typeof usernameSchema>;
  type VerifyCodeFormValues = z.infer<typeof verifyCodeSchema>;
  type PasswordFormValues = z.infer<typeof passwordSchema>;

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    () => getTabFromQuery(tabQuery) ?? (mode === "modal" ? SETTINGS_TABS.GENERAL : SETTINGS_TABS.PERSONAL_INFO),
  );
  const [session, setSession] = useState<SessionState>(null);
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isCreateUserDialogOpen, setIsCreateUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [createUserName, setCreateUserName] = useState("");
  const [createUserEmail, setCreateUserEmail] = useState("");
  const [createUserPassword, setCreateUserPassword] = useState("");
  const [createUserRole, setCreateUserRole] = useState<UserRole>(USER_ROLES.USER);
  const [userToEdit, setUserToEdit] = useState<SystemUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<SystemUser | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserRole, setEditUserRole] = useState<UserRole>(USER_ROLES.USER);
  const [editUserNewPassword, setEditUserNewPassword] = useState("");
  const [activeUserActionId, setActiveUserActionId] = useState<number | null>(null);
  const [isSubmittingUserAction, setIsSubmittingUserAction] = useState(false);
  const [isNonAdminRestrictionDialogOpen, setIsNonAdminRestrictionDialogOpen] = useState(false);
  const [contentContainerHeight, setContentContainerHeight] = useState<number | "auto">("auto");
  const animatedContentRef = useRef<HTMLDivElement | null>(null);
  const contentMeasureRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getSession().then((data) => setSession(data as SessionState));
  }, []);

  useEffect(() => {
    const tabFromQuery = getTabFromQuery(tabQuery);
    if (tabFromQuery) {
      setActiveTab(tabFromQuery);
    }
  }, [tabQuery]);

  const isAdmin = session?.user?.role === USER_ROLES.ADMIN;
  const currentSessionUserId = Number.parseInt(session?.user?.id ?? "", 10);
  const isEditingCurrentAdmin =
    isAdmin && Number.isSafeInteger(currentSessionUserId) && userToEdit?.id === currentSessionUserId;
  const openNonAdminRestrictionDialog = useCallback(() => {
    setIsNonAdminRestrictionDialogOpen(true);
  }, []);

  useEffect(() => {
    if (!isAdmin && activeTab === SETTINGS_TABS.SYSTEM_USERS) {
      setActiveTab(SETTINGS_TABS.PERSONAL_INFO);
    }
  }, [activeTab, isAdmin]);

  const updateContentContainerHeight = useCallback(() => {
    const measuredNode = contentMeasureRef.current;
    const animatedNode = animatedContentRef.current;
    if (!measuredNode || !animatedNode) return;

    const styles = window.getComputedStyle(animatedNode);
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const nextHeight = measuredNode.scrollHeight + paddingTop + paddingBottom;

    setContentContainerHeight((previousHeight) => {
      const previousHeightValue = typeof previousHeight === "number" ? previousHeight : 0;
      if (Math.abs(previousHeightValue - nextHeight) < 1) {
        return previousHeight;
      }
      return nextHeight;
    });
  }, []);

  useEffect(() => {
    if (!activeTab) return;
    updateContentContainerHeight();
  }, [activeTab, updateContentContainerHeight]);

  useEffect(() => {
    if (!activeTab) return;
    animatedContentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activeTab]);

  useEffect(() => {
    const measuredNode = contentMeasureRef.current;
    if (!measuredNode || typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(() => {
      updateContentContainerHeight();
    });

    resizeObserver.observe(measuredNode);
    return () => resizeObserver.disconnect();
  }, [updateContentContainerHeight]);

  const usernameForm = useForm<UsernameFormValues>({
    resolver: zodResolver(usernameSchema),
    defaultValues: { username: "" },
  });

  const verifyCodeForm = useForm<VerifyCodeFormValues>({
    resolver: zodResolver(verifyCodeSchema),
    defaultValues: { code: "" },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const handleOpenUsernameDialog = () => {
    if (!isAdmin) {
      openNonAdminRestrictionDialog();
      return;
    }

    usernameForm.reset({ username: session?.user?.name || "" });
    setIsUsernameDialogOpen(true);
  };

  const handleOpenPasswordDialog = () => {
    if (!isAdmin) {
      openNonAdminRestrictionDialog();
      return;
    }

    passwordForm.reset();
    setIsPasswordDialogOpen(true);
  };

  const handleUsernameUpdate = async (values: UsernameFormValues) => {
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-username",
        username: values.username,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showErrorMessage(mapSettingsApiError(data?.error, "settings.failedUpdateUsername"));
      return;
    }

    setSession((prev) => ({
      ...prev,
      user: {
        ...prev?.user,
        name: values.username,
      },
    }));
    showSuccessMessage(t("settings.usernameUpdated"));
    setIsUsernameDialogOpen(false);
  };

  const handleVerifyEmail = async (values: VerifyCodeFormValues) => {
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: values.code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showErrorMessage(mapSettingsApiError(data?.error, "settings.failedVerifyEmail"));
      return;
    }

    setSession((prev) => ({
      ...prev,
      user: {
        ...prev?.user,
        emailVerified: new Date().toISOString(),
      },
    }));
    showSuccessMessage(t("settings.emailVerified"));
    setIsVerifyDialogOpen(false);
  };

  const handleChangePassword = async (values: PasswordFormValues) => {
    if (!isAdmin) {
      openNonAdminRestrictionDialog();
      return;
    }

    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change-password",
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        confirmNewPassword: values.confirmNewPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showErrorMessage(mapSettingsApiError(data?.error, "settings.failedChangePassword"));
      return;
    }

    showSuccessMessage(t("settings.passwordUpdated"));
    setIsPasswordDialogOpen(false);
    passwordForm.reset();
  };

  const fetchSystemUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsersError(t("settings.onlyAdminsUsers"));
      setSystemUsers([]);
      return;
    }

    setIsUsersLoading(true);
    setUsersError(null);

    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(mapSettingsApiError(data?.error, "settings.failedLoadUsers"));
      }

      const users = (await response.json()) as SystemUser[];
      setSystemUsers(
        Array.isArray(users)
          ? users
              .map((user) => ({
                ...user,
                role: normalizeRole(user.role),
              }))
              .sort((leftUser, rightUser) => {
                const rolePriority = {
                  [USER_ROLES.ADMIN]: 0,
                  [USER_ROLES.USER]: 1,
                };
                const roleOrder = rolePriority[leftUser.role] - rolePriority[rightUser.role];
                if (roleOrder !== 0) return roleOrder;
                return leftUser.id - rightUser.id;
              })
          : [],
      );
    } catch (error) {
      console.error(error);
      setUsersError(t("settings.failedLoadUsers"));
    } finally {
      setIsUsersLoading(false);
    }
  }, [isAdmin, mapSettingsApiError, t]);

  useEffect(() => {
    if (activeTab === SETTINGS_TABS.SYSTEM_USERS && isAdmin) {
      void fetchSystemUsers();
    }
  }, [activeTab, fetchSystemUsers, isAdmin]);

  const resetCreateUserForm = () => {
    setCreateUserName("");
    setCreateUserEmail("");
    setCreateUserPassword("");
    setCreateUserRole(USER_ROLES.USER);
  };

  const handleCreateUser = async () => {
    if (!createUserName.trim() || !createUserEmail.trim() || !createUserPassword) {
      showErrorMessage(t("settings.validation.createUserRequired"));
      return;
    }

    if (createUserPassword.length < MIN_PASSWORD_LENGTH) {
      showErrorMessage(passwordMinLengthMessage);
      return;
    }

    setIsSubmittingUserAction(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createUserName.trim(),
          email: createUserEmail.trim().toLowerCase(),
          password: createUserPassword,
          role: createUserRole,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showErrorMessage(mapSettingsApiError(data?.error, "settings.failedCreateUser"));
        return;
      }

      showSuccessMessage(t("settings.userCreated"));
      resetCreateUserForm();
      setIsCreateUserDialogOpen(false);
      await fetchSystemUsers();
    } catch (_error) {
      showErrorMessage(t("settings.failedCreateUser"));
    } finally {
      setIsSubmittingUserAction(false);
    }
  };

  const handleOpenEditUser = (systemUser: SystemUser) => {
    setUserToEdit(systemUser);
    setEditUserName(systemUser.name || "");
    setEditUserEmail(systemUser.email || "");
    setEditUserRole(systemUser.role);
    setEditUserNewPassword("");
    setIsEditUserDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!userToEdit) return;
    const lockedEmail = (userToEdit.email || "").trim().toLowerCase();
    if (!editUserName.trim() || !lockedEmail) {
      showErrorMessage(t("settings.validation.updateUserRequired"));
      return;
    }
    const nextPassword = editUserNewPassword.trim();
    if (nextPassword && nextPassword.length < MIN_PASSWORD_LENGTH) {
      showErrorMessage(passwordMinLengthMessage);
      return;
    }
    const roleForUpdate = isEditingCurrentAdmin ? userToEdit.role : editUserRole;

    setIsSubmittingUserAction(true);
    setActiveUserActionId(userToEdit.id);

    try {
      const response = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-user",
          id: userToEdit.id,
          name: editUserName.trim(),
          email: lockedEmail,
          role: roleForUpdate,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showErrorMessage(mapSettingsApiError(data?.error, "settings.failedUpdateUser"));
        return;
      }

      if (nextPassword) {
        const passwordResponse = await fetch("/api/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reset-password",
            id: userToEdit.id,
            newPassword: nextPassword,
          }),
        });
        const passwordData = await passwordResponse.json().catch(() => ({}));
        if (!passwordResponse.ok) {
          showErrorMessage(mapSettingsApiError(passwordData?.error, "settings.failedUpdateUser"));
          return;
        }
      }

      showSuccessMessage(nextPassword ? t("settings.userUpdatedWithPassword") : t("settings.userUpdated"));
      setIsEditUserDialogOpen(false);
      setUserToEdit(null);
      setEditUserNewPassword("");
      await fetchSystemUsers();
    } catch (_error) {
      showErrorMessage(t("settings.failedUpdateUser"));
    } finally {
      setIsSubmittingUserAction(false);
      setActiveUserActionId(null);
    }
  };

  const handleDeleteUser = async (systemUser: SystemUser) => {
    setIsSubmittingUserAction(true);
    setActiveUserActionId(systemUser.id);

    try {
      const response = await fetch(`/api/users?id=${systemUser.id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showErrorMessage(mapSettingsApiError(data?.error, "settings.failedRemoveUser"));
        return;
      }

      showSuccessMessage(t("settings.userRemoved"));
      setUserToDelete(null);
      await fetchSystemUsers();
    } catch (_error) {
      showErrorMessage(t("settings.failedRemoveUser"));
    } finally {
      setIsSubmittingUserAction(false);
      setActiveUserActionId(null);
    }
  };

  const settingsOptions: Array<{ name: SettingsTab; icon: typeof User }> = [
    { name: SETTINGS_TABS.GENERAL, icon: Globe },
    { name: SETTINGS_TABS.PERSONAL_INFO, icon: User },
  ];

  if (isAdmin) settingsOptions.push({ name: SETTINGS_TABS.SYSTEM_USERS, icon: Users });

  const getTabLabel = (tab: SettingsTab) => {
    if (tab === SETTINGS_TABS.PERSONAL_INFO) return t("settings.personalInfo");
    if (tab === SETTINGS_TABS.SYSTEM_USERS) return t("settings.systemUsers");
    return t("settings.general");
  };

  const wrapperClasses =
    mode === "modal"
      ? "settings-scrollbar flex h-full min-h-0 w-full flex-col gap-8 overflow-y-auto overflow-x-hidden p-6 transition-colors duration-500 [--settings-scroll-padding:1.5rem] sm:p-8 sm:[--settings-scroll-padding:2rem]"
      : "flex min-h-screen flex-col gap-8 p-10 transition-colors duration-500";
  const contentContainerClasses =
    mode === "modal" ? "settings-scrollbar max-h-[65vh] [--settings-scroll-padding:3rem]" : "max-h-[calc(100vh-14rem)]";

  return (
    <div className={wrapperClasses}>
      <h1 className="font-bold text-3xl text-slate-900 tracking-tight dark:text-white">{t("settings.systemTitle")}</h1>

      <div className={cn("grid grid-cols-12 items-start gap-8", mode === "modal" && "shrink-0")}>
        <div className="col-span-12 space-y-3 font-medium lg:col-span-3">
          {settingsOptions.map((item) => (
            <button
              type="button"
              key={item.name}
              onClick={() => setActiveTab(item.name)}
              className={cn(
                "flex w-full items-center gap-4 rounded-2xl border p-4 transition-all duration-300",
                activeTab === item.name
                  ? "border-slate-200 bg-white text-blue-600 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  : "border-transparent bg-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900/50",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-sm">{getTabLabel(item.name)}</span>
            </button>
          ))}
        </div>

        <div className="relative col-span-12 overflow-hidden rounded-container border border-slate-100 bg-white shadow-sm lg:col-span-9 dark:border-slate-800 dark:bg-[#161B22]">
          <motion.div
            ref={animatedContentRef}
            initial={false}
            animate={{ height: contentContainerHeight }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className={cn("h-full w-full overflow-y-auto overflow-x-hidden p-12", contentContainerClasses)}
          >
            <div ref={contentMeasureRef} className="w-full">
              {activeTab === SETTINGS_TABS.PERSONAL_INFO && (
                <div className="max-w-2xl space-y-12">
                  <section className="space-y-6">
                    <h3 className="font-bold text-xl dark:text-white">{t("settings.personalInfo")}</h3>
                    <p className="text-slate-500 dark:text-slate-400">{t("settings.personalInfoSubtitle")}</p>

                    <div className="space-y-4">
                      <div className="group flex items-center justify-between rounded-container border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-[#0D1117]">
                        <div className="flex items-center gap-4">
                          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-500">
                            <User className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-base dark:text-white">{t("settings.username")}</p>
                            <p className="text-slate-500 text-sm">{session?.user?.name || t("common.loading")}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="font-semibold text-blue-600 text-sm hover:text-blue-700"
                          onClick={handleOpenUsernameDialog}
                        >
                          {t("settings.editUser")}
                        </button>
                      </div>

                      <div className="group flex items-center justify-between rounded-container border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-[#0D1117]">
                        <div className="flex items-center gap-4">
                          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-500">
                            <Mail className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-base dark:text-white">{t("settings.emailAddress")}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-slate-500 text-sm">{session?.user?.email || t("common.loading")}</p>
                              {session?.user?.emailVerified ? (
                                <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-bold text-[10px] text-green-500">
                                  <ShieldCheck className="h-3 w-3" />
                                  {t("settings.verified")}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 font-bold text-[10px] text-yellow-600">
                                  <ShieldAlert className="h-3 w-3" />
                                  {t("settings.unverified")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {!session?.user?.emailVerified ? (
                          <button
                            type="button"
                            className="font-semibold text-blue-600 text-sm hover:text-blue-700"
                            onClick={() => {
                              verifyCodeForm.reset();
                              setIsVerifyDialogOpen(true);
                            }}
                          >
                            {t("settings.verifyEmail")}
                          </button>
                        ) : (
                          <button type="button" className="font-semibold text-blue-600 text-sm hover:text-blue-700">
                            {t("settings.change")}
                          </button>
                        )}
                      </div>

                      <div className="group flex items-center justify-between rounded-container border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-[#0D1117]">
                        <div className="flex items-center gap-4">
                          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-500">
                            <Key className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-base dark:text-white">{t("auth.field.password")}</p>
                            <p className="text-slate-500 text-sm">********</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="font-semibold text-blue-600 text-sm hover:text-blue-700"
                          onClick={handleOpenPasswordDialog}
                        >
                          {t("settings.changePassword")}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === SETTINGS_TABS.SYSTEM_USERS && (
                <div className="max-w-3xl space-y-8">
                  <section className="space-y-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <h3 className="font-bold text-xl dark:text-white">{t("settings.systemUsers")}</h3>
                        <p className="text-slate-500 dark:text-slate-400">{t("settings.systemUsersSubtitle")}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
                        <Button
                          type="button"
                          onClick={() => setIsCreateUserDialogOpen(true)}
                          disabled={!isAdmin || isSubmittingUserAction}
                        >
                          {t("settings.createUser")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            void fetchSystemUsers();
                          }}
                          disabled={isUsersLoading}
                        >
                          <RefreshCw className={cn("mr-2 h-4 w-4", isUsersLoading ? "animate-spin" : "")} />
                          {t("common.refresh")}
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-container border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-[#0D1117]">
                      <p className="font-semibold text-slate-900 text-sm dark:text-white">
                        {t("settings.totalUsers", { count: systemUsers.length })}
                      </p>
                    </div>

                    {isUsersLoading ? (
                      <div className="rounded-container border border-slate-100 bg-slate-50 p-5 text-slate-500 text-sm dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-400">
                        {t("common.loadingUsers")}
                      </div>
                    ) : usersError ? (
                      <div className="rounded-container border border-red-200 bg-red-50 p-5 text-red-600 text-sm dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                        {usersError}
                      </div>
                    ) : systemUsers.length === 0 ? (
                      <div className="rounded-container border border-slate-100 bg-slate-50 p-5 text-slate-500 text-sm dark:border-slate-800 dark:bg-[#0D1117] dark:text-slate-400">
                        {t("settings.noUsersFound")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {systemUsers.map((systemUser) => {
                          const isCurrentLoggedInAdmin =
                            isAdmin &&
                            systemUser.role === USER_ROLES.ADMIN &&
                            Number.isSafeInteger(currentSessionUserId) &&
                            currentSessionUserId === systemUser.id;

                          return (
                            <div
                              key={systemUser.id}
                              className="group relative rounded-container border border-slate-100 bg-slate-50 px-4 py-3 pe-28 dark:border-slate-800 dark:bg-[#0D1117]"
                            >
                              <div
                                className={cn(
                                  "absolute end-3 top-3 z-[9] flex items-center opacity-100 transition-all duration-200",
                                  !isCurrentLoggedInAdmin &&
                                    "group-focus-within:-translate-y-1 group-hover:-translate-y-1 group-focus-within:pointer-events-none group-focus-within:opacity-0 group-hover:pointer-events-none group-hover:opacity-0",
                                )}
                              >
                                {activeUserActionId === systemUser.id && isSubmittingUserAction ? (
                                  <span className="rounded-full bg-blue-500/10 px-2 py-1 font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                                    {t("common.processing")}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-blue-500/10 px-2 py-1 font-semibold text-[11px] text-blue-600 dark:text-blue-400">
                                    ID #{systemUser.id}
                                  </span>
                                )}
                              </div>

                              {!isCurrentLoggedInAdmin && (
                                <div className="pointer-events-none absolute end-3 top-3 z-10 flex translate-y-1 items-center gap-2 opacity-0 transition-all duration-200 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenEditUser(systemUser)}
                                    disabled={isSubmittingUserAction}
                                  >
                                    <UserRoundPen className="me-1 h-3.5 w-3.5" />
                                    {t("settings.editUser")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setUserToDelete(systemUser)}
                                    disabled={isSubmittingUserAction}
                                    className="px-2.5"
                                    aria-label={t("settings.removeUser")}
                                    title={t("settings.removeUser")}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              )}

                              <div className="min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-semibold text-slate-900 text-sm dark:text-white">
                                    {systemUser.name || t("settings.unnamedUser")}
                                  </p>
                                  {systemUser.role === USER_ROLES.ADMIN && (
                                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-semibold text-[10px] text-emerald-600 dark:text-emerald-400">
                                      {t("settings.roleAdmin")}
                                    </span>
                                  )}
                                  {isCurrentLoggedInAdmin && (
                                    <span className="rounded-full bg-blue-500/10 px-2 py-1 font-semibold text-[10px] text-blue-600 dark:text-blue-400">
                                      {t("settings.you")}
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-slate-500 text-sm dark:text-slate-400">
                                  {systemUser.email || t("settings.noEmail")}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {activeTab === SETTINGS_TABS.GENERAL && (
                <div className="max-w-2xl space-y-8">
                  <section className="space-y-6">
                    <h3 className="font-bold text-xl dark:text-white">{t("settings.general")}</h3>
                    <div className="rounded-container border border-slate-100 bg-slate-50 p-5 dark:border-slate-800 dark:bg-[#0D1117]">
                      <div className="mb-3">
                        <p className="font-bold text-base dark:text-white">{t("settings.languageSection")}</p>
                        <p className="text-slate-500 text-sm dark:text-slate-400">{t("settings.languageHelp")}</p>
                      </div>
                      <LanguageSwitcher showLabel />
                    </div>
                  </section>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <Dialog open={isCreateUserDialogOpen} onOpenChange={setIsCreateUserDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{t("settings.createUser")}</DialogTitle>
            <DialogDescription>{t("settings.createUserDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.name")}</Label>
              <Input value={createUserName} onChange={(event) => setCreateUserName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.emailAddress")}</Label>
              <Input
                type="email"
                value={createUserEmail}
                onChange={(event) => setCreateUserEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("auth.field.password")}</Label>
              <Input
                type="password"
                value={createUserPassword}
                onChange={(event) => setCreateUserPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.role")}</Label>
              <Select value={createUserRole} onValueChange={(value) => setCreateUserRole(normalizeRole(value))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("settings.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={USER_ROLES.USER}>{t("settings.roleUser")}</SelectItem>
                  <SelectItem value={USER_ROLES.ADMIN}>{t("settings.roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  void handleCreateUser();
                }}
                disabled={isSubmittingUserAction}
              >
                {isSubmittingUserAction ? `${t("common.create")}...` : t("settings.createUser")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditUserDialogOpen}
        onOpenChange={(open) => {
          setIsEditUserDialogOpen(open);
          if (!open) {
            setUserToEdit(null);
            setEditUserNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{t("settings.editUser")}</DialogTitle>
            <DialogDescription>{t("settings.editUserDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("settings.name")}</Label>
              <Input value={editUserName} onChange={(event) => setEditUserName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.emailAddress")}</Label>
              <Input
                type="email"
                value={editUserEmail}
                readOnly
                aria-readonly="true"
                className="bg-slate-100 text-slate-500 dark:bg-slate-900/60 dark:text-slate-300"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.role")}</Label>
              <Select
                value={editUserRole}
                onValueChange={(value) => setEditUserRole(normalizeRole(value))}
                disabled={Boolean(isEditingCurrentAdmin)}
              >
                <SelectTrigger className="w-full" disabled={Boolean(isEditingCurrentAdmin)}>
                  <SelectValue placeholder={t("settings.selectRole")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={USER_ROLES.USER}>{t("settings.roleUser")}</SelectItem>
                  <SelectItem value={USER_ROLES.ADMIN}>{t("settings.roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
              {isEditingCurrentAdmin && (
                <p className="text-slate-500 text-xs dark:text-slate-400">{t("settings.cannotChangeOwnRole")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("settings.resetPasswordOptional")}</Label>
              <Input
                type="password"
                value={editUserNewPassword}
                onChange={(event) => setEditUserNewPassword(event.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
                autoComplete="new-password"
              />
              <p className="text-slate-500 text-xs dark:text-slate-400">{t("settings.keepPasswordHint")}</p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  void handleUpdateUser();
                }}
                disabled={isSubmittingUserAction || !userToEdit}
              >
                {isSubmittingUserAction ? `${t("common.save")}...` : t("common.saveChanges")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => {
          if (!open && !isSubmittingUserAction) {
            setUserToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.removeUserTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.removeUserDesc", {
                name: userToDelete?.name || userToDelete?.email || t("settings.thisUser"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(isSubmittingUserAction)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!userToDelete || Boolean(isSubmittingUserAction)}
              onClick={(event) => {
                event.preventDefault();
                if (!userToDelete) return;
                void handleDeleteUser(userToDelete);
              }}
            >
              {isSubmittingUserAction ? `${t("common.delete")}...` : t("settings.removeUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isNonAdminRestrictionDialogOpen} onOpenChange={setIsNonAdminRestrictionDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("common.restricted")}</DialogTitle>
            <DialogDescription>{t("settings.requestAdminEdit")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setIsNonAdminRestrictionDialogOpen(false)}>
              {t("common.ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUsernameDialogOpen} onOpenChange={setIsUsernameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("settings.editUsernameTitle")}</DialogTitle>
            <DialogDescription>{t("settings.editUsernameDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...usernameForm}>
            <form onSubmit={usernameForm.handleSubmit(handleUsernameUpdate)} className="space-y-4">
              <FormField
                control={usernameForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.username")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">{t("common.update")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isVerifyDialogOpen} onOpenChange={setIsVerifyDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("settings.verifyEmailTitle")}</DialogTitle>
            <DialogDescription>{t("settings.verifyEmailDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...verifyCodeForm}>
            <form onSubmit={verifyCodeForm.handleSubmit(handleVerifyEmail)} className="space-y-4">
              <FormField
                control={verifyCodeForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.verificationCode")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("settings.verificationCodePlaceholder")} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit">{t("settings.verifyAction")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("settings.changePasswordTitle")}</DialogTitle>
            <DialogDescription>{t("settings.changePasswordDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(handleChangePassword)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.currentPassword")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="********" autoComplete="current-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.newPassword")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="********" autoComplete="new-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmNewPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.confirmNewPassword")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder="********" autoComplete="new-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={!passwordForm.formState.isValid || passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting
                    ? `${t("common.update")}...`
                    : t("settings.updatePasswordAction")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
