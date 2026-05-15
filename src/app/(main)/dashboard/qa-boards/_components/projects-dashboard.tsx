"use client";

import { useCallback, useEffect, useState } from "react";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { ExternalLink, Pencil, PlusCircle, Trash2, User as UserIcon } from "lucide-react";
import type { Session } from "next-auth";

import { LayoutSwitcher, type LayoutSwitcherValue } from "@/components/layout-switcher";
import { AddProjectDialog } from "@/components/projects/add-project-dialog";
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { USER_ROLES } from "@/lib/auth/roles";
import { useI18n } from "@/lib/i18n/use-i18n";
import { showSuccessMessage } from "@/lib/notifications";

type Project = {
  id: string;
  name: string;
  url: string | null;
  logo: string | null;
  createdBy: string | null;
  userId: number | null;
  user: {
    id: number;
    name: string | null;
    email?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const PROJECTS_VIEW_MODE_STORAGE_KEY = "qa-boards-projects-view-mode";
type ProjectEditState = {
  id: string;
  name: string;
  url: string | null;
  logo: string | null;
};

type ProjectsDashboardVariant = "default" | "nexumind";

export function ProjectsDashboard({
  session,
  variant = "default",
}: {
  session: Session | null;
  variant?: ProjectsDashboardVariant;
}) {
  const { t, locale } = useI18n();
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<ProjectEditState | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [isNonAdminRestrictionDialogOpen, setIsNonAdminRestrictionDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<LayoutSwitcherValue>(() => {
    if (typeof window === "undefined") {
      return "grid";
    }

    const storedViewMode = window.localStorage.getItem(PROJECTS_VIEW_MODE_STORAGE_KEY);
    if (storedViewMode === "grid" || storedViewMode === "table") return storedViewMode;
    if (storedViewMode === "cards") return "grid";
    return "grid";
  });

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const handleStartEditProject = (project: Project) => {
    if (!isAdmin) return;

    setProjectToEdit({
      id: project.id,
      name: project.name,
      url: project.url,
      logo: project.logo,
    });
  };

  const handleProjectUpdateSuccess = async (updatedProject: { name?: string }) => {
    showSuccessMessage(t("qa.projects.updatedSuccess", { name: updatedProject?.name || t("qa.projects.project") }));
    setProjectToEdit(null);
    await fetchProjects();
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    const projectId = projectToDelete.id;
    setDeletingProjectId(projectId);
    try {
      const res = await fetch(`/api/projects?id=${projectId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchProjects();
        showSuccessMessage(t("qa.projects.deletedSuccess"));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDeletingProjectId(null);
      setProjectToDelete(null);
    }
  };

  const handleOpenProject = (project: Project) => {
    router.push(`/dashboard/qa-boards/${project.id}`);
  };

  const userName = session?.user?.name || t("qa.projects.anonymous");
  const isAdmin = session?.user?.role === USER_ROLES.ADMIN;
  const isNexumindLayout = variant === "nexumind";

  const handleOpenAddProject = () => {
    if (!isAdmin) {
      setIsNonAdminRestrictionDialogOpen(true);
      return;
    }

    setIsCreateProjectDialogOpen(true);
  };

  if (loading) {
    return <div className="flex h-full w-full items-center justify-center">{t("common.loadingProjects")}</div>;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      {isNexumindLayout ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AddProjectDialog
            creatorDisplay={userName}
            onProjectAdded={fetchProjects}
            open={isCreateProjectDialogOpen}
            onOpenChange={setIsCreateProjectDialogOpen}
          />
          <Button type="button" onClick={handleOpenAddProject}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t("qa.projects.add")}
          </Button>
        </div>
      ) : null}

      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        {isNexumindLayout ? (
          <h2 className="font-semibold text-slate-900 text-xl tracking-tight dark:text-white">
            {t("qa.projects.current")}
          </h2>
        ) : (
          <h2 className="font-semibold text-xl tracking-tight">{t("qa.projects.current")}</h2>
        )}
        {projects.length > 0 ? <LayoutSwitcher value={viewMode} onChange={setViewMode} /> : null}
      </div>

      {projects.length === 0 ? (
        isNexumindLayout ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-slate-300 border-dashed bg-white/40 p-6 dark:border-slate-700 dark:bg-slate-900/30">
            <p className="text-muted-foreground">{t("qa.projects.empty")}</p>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-muted-foreground">{t("qa.projects.empty")}</p>
            </div>
          </div>
        )
      ) : viewMode === "grid" ? (
        <div className="flex flex-wrap items-start gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="group h-fit w-fit max-w-full gap-3 self-start py-4">
              <CardHeader className="gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {project.logo ? (
                      <Image
                        src={project.logo}
                        alt={`${project.name} logo`}
                        width={32}
                        height={32}
                        unoptimized
                        className="h-8 w-8 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-md border border-slate-300 border-dashed dark:border-slate-700" />
                    )}
                    <CardTitle className="text-xl">{project.name}</CardTitle>
                  </div>
                  {isNexumindLayout && isAdmin ? (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8"
                        aria-label={t("qa.projects.updateAria", { name: project.name })}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartEditProject(project);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={t("qa.projects.deleteAria", { name: project.name })}
                        disabled={Boolean(deletingProjectId)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setProjectToDelete(project);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 text-muted-foreground text-sm">
                  {project.url && (
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-4 w-4" />
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        {project.url}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span>
                      {t("qa.projects.createdBy")}{" "}
                      {project.user?.name || project.user?.email || project.createdBy || t("common.unknown")}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <Button variant="secondary" className="w-full" onClick={() => handleOpenProject(project)}>
                  {t("qa.projects.open")}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/5 px-3 py-2">{t("qa.projects.project")}</TableHead>
                <TableHead className="w-1/5 px-3 py-2">{t("qa.projects.url")}</TableHead>
                <TableHead className="w-1/5 px-3 py-2">{t("qa.projects.createdBy")}</TableHead>
                <TableHead className="w-1/5 px-3 py-2">{t("qa.projects.createdAt")}</TableHead>
                <TableHead className="w-1/5 px-3 py-2 text-end">{t("qa.projects.lastUpdate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id} className="group cursor-pointer" onClick={() => handleOpenProject(project)}>
                  <TableCell className="w-1/5 px-3 py-2 font-medium">
                    <div className="flex w-full min-w-0 items-center gap-2">
                      {project.logo ? (
                        <Image
                          src={project.logo}
                          alt={`${project.name} logo`}
                          width={28}
                          height={28}
                          unoptimized
                          className="h-7 w-7 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <div className="h-7 w-7 rounded-md border border-slate-300 border-dashed dark:border-slate-700" />
                      )}
                      <span className="block min-w-0 flex-1 truncate">{project.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="w-1/5 px-3 py-2">
                    {project.url ? (
                      <Button asChild variant="secondary" size="sm" className="h-8">
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {t("qa.projects.website")}
                        </a>
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="w-1/5 px-3 py-2">
                    <span className="block truncate">
                      {project.user?.name || project.user?.email || project.createdBy || t("common.unknown")}
                    </span>
                  </TableCell>
                  <TableCell className="w-1/5 px-3 py-2">
                    {new Date(project.createdAt).toLocaleDateString(localeCode)}
                  </TableCell>
                  <TableCell className="w-1/5 px-3 py-2 text-end">
                    <div className="relative flex min-h-8 w-full items-center justify-end">
                      <span
                        className={
                          isNexumindLayout && isAdmin
                            ? "transition-opacity group-focus-within:opacity-0 group-hover:opacity-0"
                            : undefined
                        }
                      >
                        {new Date(project.updatedAt).toLocaleDateString(localeCode)}
                      </span>
                      {isNexumindLayout && isAdmin ? (
                        <div className="-translate-y-1/2 pointer-events-none absolute end-0 top-1/2 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-8 w-8"
                            aria-label={t("qa.projects.updateAria", { name: project.name })}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleStartEditProject(project);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={t("qa.projects.deleteAria", { name: project.name })}
                            disabled={Boolean(deletingProjectId)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setProjectToDelete(project);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {projectToEdit ? (
        <AddProjectDialog
          mode="update"
          open={Boolean(projectToEdit)}
          onOpenChange={(open) => {
            if (!open) setProjectToEdit(null);
          }}
          projectToEdit={projectToEdit}
          creatorDisplay={userName}
          onProjectAdded={handleProjectUpdateSuccess}
        />
      ) : null}

      <AlertDialog
        open={Boolean(projectToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingProjectId) {
            setProjectToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("qa.projects.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("qa.projects.deleteDescription", { name: projectToDelete?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingProjectId)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deletingProjectId)}
              onClick={() => {
                void handleDeleteProject();
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isNonAdminRestrictionDialogOpen} onOpenChange={setIsNonAdminRestrictionDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("qa.projects.accessRestricted")}</DialogTitle>
            <DialogDescription>{t("qa.projects.requestAdmin")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setIsNonAdminRestrictionDialogOpen(false)}>
              {t("common.ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
