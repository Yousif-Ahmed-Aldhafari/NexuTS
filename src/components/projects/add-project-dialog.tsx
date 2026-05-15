"use client";

import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useI18n } from "@/lib/i18n/use-i18n";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const createProjectFormSchema = (t: ReturnType<typeof useI18n>["t"]) =>
  z.object({
    name: z.string().min(1, { message: t("addProject.nameRequired") }),
    url: z.string().url({ message: t("addProject.urlInvalid") }),
    logo: z
      .string()
      .min(1, { message: t("addProject.logoRequired") })
      .refine((value) => value.startsWith("data:image/png;base64,"), {
        message: t("addProject.logoPng"),
      }),
  });

type ProjectFormValues = {
  name: string;
  url: string;
  logo: string;
};

type AddProjectDialogProps = {
  trigger?: ReactNode;
  creatorDisplay: string;
  onProjectAdded?: (project: { id?: string; name?: string }) => void | Promise<void>;
  mode?: "create" | "update";
  projectToEdit?: {
    id: string;
    name: string;
    url: string | null;
    logo: string | null;
  } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onError?: (message: string | null) => void;
};

export function AddProjectDialog({
  trigger,
  creatorDisplay,
  onProjectAdded,
  mode = "create",
  projectToEdit,
  open,
  onOpenChange,
  onError,
}: AddProjectDialogProps) {
  const { t } = useI18n();
  const mapProjectError = useCallback(
    (message: unknown, nextMode: "create" | "update") => {
      const fallback = t(nextMode === "update" ? "addProject.failedUpdate" : "addProject.failedAdd");
      if (typeof message !== "string" || message.length === 0) return fallback;

      if (message === "You must be signed in to create a project") return t("addProject.authRequired");
      if (message === "Only admins can add projects.") return t("addProject.adminOnly");
      if (message === "Project name is required") return t("addProject.nameRequired");
      if (message === "Project logo must be a PNG file.") return t("addProject.logoPng");
      if (message === "A project with this name already exists.") return t("addProject.duplicateName");
      if (message === "A project with this URL already exists.") return t("addProject.duplicateUrl");
      if (message === "Project ID and name are required") return t("addProject.idAndNameRequired");
      if (message === "Could not determine username for project creator. Please update your profile name.") {
        return t("addProject.creatorUnavailable");
      }

      return fallback;
    },
    [t],
  );
  const formSchema = useMemo(() => createProjectFormSchema(t), [t]);

  const [isOpen, setIsOpen] = useState(false);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [projectLogoName, setProjectLogoName] = useState("");
  const [logoInputKey, setLogoInputKey] = useState(0);
  const [projectError, setProjectError] = useState<string | null>(null);

  const projectForm = useForm<ProjectFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      url: "",
      logo: "",
    },
  });

  const projectLogoPreview = projectForm.watch("logo");
  const isControlled = typeof open === "boolean";
  const currentOpen = isControlled ? open : isOpen;

  const resetForm = () => {
    projectForm.reset({
      name: projectToEdit?.name || "",
      url: projectToEdit?.url || "",
      logo: projectToEdit?.logo || "",
    });
    setProjectLogoName("");
    setLogoInputKey((prev) => prev + 1);
    setProjectError(null);
    onError?.(null);
  };

  useEffect(() => {
    if (!currentOpen) return;

    projectForm.reset({
      name: projectToEdit?.name || "",
      url: projectToEdit?.url || "",
      logo: projectToEdit?.logo || "",
    });
    setProjectLogoName(projectToEdit?.logo ? t("addProject.currentLogo") : "");
    setProjectError(null);
  }, [currentOpen, projectForm, projectToEdit, t]);

  const handleProjectLogoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      projectForm.setValue("logo", "", { shouldValidate: true });
      setProjectLogoName("");
      return;
    }

    if (file.type !== "image/png") {
      projectForm.setValue("logo", "", { shouldValidate: true });
      projectForm.setError("logo", { type: "validate", message: t("addProject.logoPng") });
      setProjectLogoName("");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      projectForm.setValue("logo", result, { shouldValidate: true, shouldDirty: true });
      setProjectLogoName(file.name);
      setProjectError(null);
      onError?.(null);
    };
    reader.onerror = () => {
      const message = t("addProject.readLogoFailed");
      setProjectError(message);
      onError?.(message);
      projectForm.setValue("logo", "", { shouldValidate: true });
      setProjectLogoName("");
    };
    reader.readAsDataURL(file);
  };

  const handleAddProject = async (values: ProjectFormValues) => {
    setIsAddingProject(true);
    setProjectError(null);
    onError?.(null);

    try {
      const response = await fetch("/api/projects", {
        method: mode === "update" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectToEdit?.id,
          name: values.name,
          url: values.url,
          logo: values.logo,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const message = mapProjectError(data?.error, mode);
        setProjectError(message);
        onError?.(message);
        return;
      }

      resetForm();
      if (isControlled) {
        onOpenChange?.(false);
      } else {
        setIsOpen(false);
      }
      await onProjectAdded?.(data);
    } catch (_error) {
      const message = t(mode === "update" ? "addProject.failedUpdate" : "addProject.failedAdd");
      setProjectError(message);
      onError?.(message);
    } finally {
      setIsAddingProject(false);
    }
  };

  return (
    <Dialog
      open={currentOpen}
      onOpenChange={(nextOpen) => {
        if (isControlled) {
          onOpenChange?.(nextOpen);
        } else {
          setIsOpen(nextOpen);
        }
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>{mode === "update" ? t("addProject.titleUpdate") : t("addProject.titleCreate")}</DialogTitle>
          <DialogDescription>
            {mode === "update" ? t("addProject.descriptionUpdate") : t("addProject.descriptionCreate")}
          </DialogDescription>
        </DialogHeader>
        <Form {...projectForm}>
          <form onSubmit={projectForm.handleSubmit(handleAddProject)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
              <FormItem className="space-y-3">
                <FormLabel>{t("addProject.creator")}</FormLabel>
                <FormControl>
                  <Input value={creatorDisplay} disabled className="h-11" />
                </FormControl>
              </FormItem>

              <FormField
                control={projectForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>{t("addProject.projectName")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("addProject.projectNamePlaceholder")} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={projectForm.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>{t("addProject.projectUrl")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="url" placeholder={t("execution.urlPlaceholder")} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={projectForm.control}
                name="logo"
                render={() => (
                  <FormItem className="space-y-3">
                    <FormLabel>{t("addProject.projectLogo")}</FormLabel>
                    <FormControl>
                      <Input
                        key={logoInputKey}
                        id="project-logo"
                        type="file"
                        accept="image/png"
                        onChange={handleProjectLogoChange}
                        className="h-auto py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200"
                      />
                    </FormControl>
                    {projectLogoName ? (
                      <p className="text-slate-500 text-xs dark:text-slate-400">{projectLogoName}</p>
                    ) : null}
                    {projectLogoPreview ? (
                      <Image
                        src={projectLogoPreview}
                        alt={t("addProject.previewAlt")}
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {projectError ? <p className="font-medium text-rose-500 text-sm">{projectError}</p> : null}
            </div>

            <div className="shrink-0 border-t px-6 py-4">
              <Button type="submit" disabled={isAddingProject} className="inline-flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                {isAddingProject
                  ? mode === "update"
                    ? t("addProject.updating")
                    : t("addProject.adding")
                  : mode === "update"
                    ? t("addProject.updateButton")
                    : t("addProject.addButton")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
