"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  JOB_APPLICATION_STATUSES,
  type JobApplicationStatus,
} from "@/lib/jobApplications";

type JobApplication = {
  id: string;
  title: string;
  company: string;
  dateApplied: string;
  status: JobApplicationStatus;
  applicationUrl: string | null;
  location: string | null;
  salary: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobApplicationDraft = {
  title: string;
  company: string;
  dateApplied: string;
  status: JobApplicationStatus;
  applicationUrl: string;
  location: string;
  salary: string;
  notes: string;
};

const statusDetails: Record<
  JobApplicationStatus,
  { label: string; shortLabel: string; dotClassName: string }
> = {
  APPLIED: {
    label: "Applied",
    shortLabel: "Applied",
    dotClassName: "bg-gray-400",
  },
  OA: {
    label: "Online assessment",
    shortLabel: "OA",
    dotClassName: "bg-amber-400",
  },
  INTERVIEWING: {
    label: "Interviewing",
    shortLabel: "Interviewing",
    dotClassName: "bg-blue-500",
  },
  ACCEPTED: {
    label: "Accepted",
    shortLabel: "Accepted",
    dotClassName: "bg-emerald-500",
  },
  REJECTED: {
    label: "Rejected",
    shortLabel: "Rejected",
    dotClassName: "bg-rose-400",
  },
};

const allApplicationsStatusDetails = {
  label: "All applications",
  dotClassName: "bg-blue-500",
};

function getTodayDateString() {
  const currentDate = new Date();
  const timezoneOffset = currentDate.getTimezoneOffset() * 60_000;
  return new Date(currentDate.getTime() - timezoneOffset)
    .toISOString()
    .slice(0, 10);
}

function createEmptyDraft(): JobApplicationDraft {
  return {
    title: "",
    company: "",
    dateApplied: getTodayDateString(),
    status: "APPLIED",
    applicationUrl: "",
    location: "",
    salary: "",
    notes: "",
  };
}

function createDraftFromApplication(
  application: JobApplication
): JobApplicationDraft {
  return {
    title: application.title,
    company: application.company,
    dateApplied: application.dateApplied,
    status: application.status,
    applicationUrl: application.applicationUrl ?? "",
    location: application.location ?? "",
    salary: application.salary ?? "",
    notes: application.notes ?? "",
  };
}

function getStatusMenuPosition(triggerElement: HTMLButtonElement) {
  const triggerBounds = triggerElement.getBoundingClientRect();
  const menuHeight = 204;
  const menuGap = 4;
  const hasRoomBelow =
    triggerBounds.bottom + menuGap + menuHeight <= window.innerHeight;

  return {
    left: triggerBounds.left,
    top: hasRoomBelow
      ? triggerBounds.bottom + menuGap
      : triggerBounds.top - menuHeight - menuGap,
    width: Math.max(triggerBounds.width, 184),
  };
}

function StatusDropdown({
  value,
  onChange,
  showBorder = false,
  statusCounts,
  allCount,
}: {
  value: JobApplicationStatus | "ALL";
  onChange: (status: JobApplicationStatus | "ALL") => void;
  showBorder?: boolean;
  statusCounts?: Record<JobApplicationStatus, number>;
  allCount?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    left: 0,
    top: 0,
    width: 184,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const showAllOption = allCount !== undefined;
  const dropdownStatuses: Array<JobApplicationStatus | "ALL"> = showAllOption
    ? ["ALL", ...JOB_APPLICATION_STATUSES]
    : [...JOB_APPLICATION_STATUSES];
  const selectedStatus =
    value === "ALL" ? allApplicationsStatusDetails : statusDetails[value];

  useEffect(() => {
    if (!isOpen) return;

    function closeWhenClickingOutside(event: MouseEvent) {
      const clickTarget = event.target as Node;
      if (
        !triggerRef.current?.contains(clickTarget) &&
        !menuRef.current?.contains(clickTarget)
      ) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    function updateMenuPosition() {
      if (triggerRef.current) {
        setMenuPosition(getStatusMenuPosition(triggerRef.current));
      }
    }

    document.addEventListener("mousedown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  function toggleDropdown() {
    if (!isOpen && triggerRef.current) {
      setMenuPosition(getStatusMenuPosition(triggerRef.current));
    }
    setIsOpen((currentIsOpen) => !currentIsOpen);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={toggleDropdown}
        className={`flex min-h-9 w-full items-center gap-2 rounded-md border px-2.5 text-left text-[13px] transition ${
          isOpen
            ? "border-blue-400 bg-white ring-4 ring-blue-100 dark:border-blue-500 dark:bg-gray-900 dark:ring-blue-950"
            : showBorder
              ? "min-h-[42px] border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
              : "border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800"
        }`}
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${selectedStatus.dotClassName}`}
        />
        <span className="min-w-0 flex-1 truncate">{selectedStatus.label}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen &&
        createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Application status"
          style={menuPosition}
          className="fixed z-[100] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-xl shadow-gray-900/15 dark:border-gray-700 dark:bg-gray-800"
        >
          {dropdownStatuses.map((status) => {
            const optionDetails =
              status === "ALL"
                ? allApplicationsStatusDetails
                : statusDetails[status];
            const optionCount =
              status === "ALL" ? allCount : statusCounts?.[status];
            const isSelected = status === value;
            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(status);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition ${
                  isSelected
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${optionDetails.dotClassName}`}
                />
                <span className="flex-1">{optionDetails.label}</span>
                {optionCount !== undefined && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    {optionCount}
                  </span>
                )}
                {isSelected && <Check size={13} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function DeleteConfirmationDialog({
  application,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  application: JobApplication;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleting) onCancel();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isDeleting, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`delete-application-title-${application.id}`}
        className="job-modal-enter w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
          <Trash2 size={18} />
        </div>
        <h2
          id={`delete-application-title-${application.id}`}
          className="mt-4 text-lg font-semibold text-gray-900 dark:text-white"
        >
          Delete application?
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
          This will permanently remove{" "}
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {application.title || "this untitled application"}
          </span>
          {application.company ? ` at ${application.company}` : ""}.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex min-w-24 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {isDeleting && <LoaderCircle size={15} className="animate-spin" />}
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ApplicationRow({
  application,
  applicationIndex,
  view,
  onSaved,
  onDeleted,
}: {
  application: JobApplication;
  applicationIndex: number;
  view: "desktop" | "mobile";
  onSaved: (application: JobApplication) => void;
  onDeleted: (applicationId: string) => void;
}) {
  const [draft, setDraft] = useState<JobApplicationDraft>(() =>
    createDraftFromApplication(application)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] =
    useState(false);
  const saveQueueRef = useRef(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const lastQueuedDraftRef = useRef(
    JSON.stringify(createDraftFromApplication(application))
  );

  useEffect(() => {
    if (pendingSaveCountRef.current > 0) return;

    const updatedDraft = createDraftFromApplication(application);
    setDraft(updatedDraft);
    lastQueuedDraftRef.current = JSON.stringify(updatedDraft);
  }, [application]);

  function updateDraft(
    fieldName: keyof JobApplicationDraft,
    value: string
  ) {
    setDraft((currentDraft) => ({ ...currentDraft, [fieldName]: value }));
    setErrorMessage("");
  }

  function queueApplicationSave(draftToSave: JobApplicationDraft) {
    const serializedDraft = JSON.stringify(draftToSave);
    if (serializedDraft === lastQueuedDraftRef.current) return;

    lastQueuedDraftRef.current = serializedDraft;
    pendingSaveCountRef.current += 1;
    setIsSaving(true);
    setErrorMessage("");

    async function saveQueuedDraft() {
      try {
        const response = await fetch(`/api/job-applications/${application.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: serializedDraft,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          throw new Error(errorBody?.error || "Could not save application");
        }

        onSaved(await response.json());
      } catch (error) {
        lastQueuedDraftRef.current = "";
        setErrorMessage(
          error instanceof Error ? error.message : "Could not save application"
        );
      } finally {
        pendingSaveCountRef.current -= 1;
        if (pendingSaveCountRef.current === 0) setIsSaving(false);
      }
    }

    saveQueueRef.current = saveQueueRef.current.then(
      saveQueuedDraft,
      saveQueuedDraft
    );
  }

  function updateStatus(status: JobApplicationStatus) {
    const updatedDraft = { ...draft, status };
    setDraft(updatedDraft);
    setErrorMessage("");
    queueApplicationSave(updatedDraft);
  }

  async function deleteApplication() {
    setIsSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/job-applications/${application.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not delete application");
      onDeleted(application.id);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete application"
      );
      setIsSaving(false);
      setIsDeleteConfirmationOpen(false);
    }
  }

  if (view === "mobile") {
    return (
      <article
        id={`mobile-job-application-${application.id}`}
        className="scroll-m-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-gray-100 px-1.5 font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {applicationIndex}
            </span>
            {isSaving && (
              <>
                <LoaderCircle size={14} className="animate-spin text-blue-500" />
                Saving…
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsDeleteConfirmationOpen(true)}
            disabled={isSaving}
            className="rounded-md p-2 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/30"
            aria-label="Delete application"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="job-mobile-field col-span-2">
            <span>Job title</span>
            <input
              value={draft.title}
              onChange={(event) => updateDraft("title", event.target.value)}
              onBlur={() => queueApplicationSave(draft)}
              placeholder="Job title"
            />
          </label>

          <label className="job-mobile-field col-span-2">
            <span>Company / hospital</span>
            <input
              value={draft.company}
              onChange={(event) => updateDraft("company", event.target.value)}
              onBlur={() => queueApplicationSave(draft)}
              placeholder="Company or hospital"
            />
          </label>

          <div className="job-mobile-field">
            <span>Status</span>
            <StatusDropdown
              value={draft.status}
              onChange={(status) => {
                if (status !== "ALL") updateStatus(status);
              }}
              showBorder
            />
          </div>

          <label className="job-mobile-field">
            <span>Date applied</span>
            <input
              type="date"
              value={draft.dateApplied}
              onChange={(event) =>
                updateDraft("dateApplied", event.target.value)
              }
              onBlur={() => queueApplicationSave(draft)}
            />
          </label>

          <label className="job-mobile-field">
            <span>Location</span>
            <input
              value={draft.location}
              onChange={(event) => updateDraft("location", event.target.value)}
              onBlur={() => queueApplicationSave(draft)}
              placeholder="Location"
            />
          </label>

          <label className="job-mobile-field">
            <span>Salary</span>
            <input
              value={draft.salary}
              onChange={(event) => updateDraft("salary", event.target.value)}
              onBlur={() => queueApplicationSave(draft)}
              placeholder="Salary"
            />
          </label>

          <label className="job-mobile-field col-span-2">
            <span>Application link</span>
            <div className="flex items-center gap-2">
              <input
                value={draft.applicationUrl}
                onChange={(event) =>
                  updateDraft("applicationUrl", event.target.value)
                }
                onBlur={() => queueApplicationSave(draft)}
                placeholder="Application link"
              />
              {application.applicationUrl && (
                <a
                  href={application.applicationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-gray-200 p-2.5 text-gray-400 transition hover:text-blue-600 dark:border-gray-700"
                  aria-label="Open application link"
                >
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
          </label>

          <label className="job-mobile-field col-span-2">
            <span>Notes</span>
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => updateDraft("notes", event.target.value)}
              onBlur={() => queueApplicationSave(draft)}
              placeholder="Notes"
            />
          </label>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <CircleAlert size={14} />
            {errorMessage}
          </div>
        )}
        {isDeleteConfirmationOpen && (
          <DeleteConfirmationDialog
            application={application}
            isDeleting={isSaving}
            onCancel={() => setIsDeleteConfirmationOpen(false)}
            onConfirm={deleteApplication}
          />
        )}
      </article>
    );
  }

  return (
    <div
      className="border-b border-gray-200 bg-white last:border-b-0 dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="job-table-grid min-w-[1430px] items-start">
        <div className="px-3 py-[1.15rem] text-center text-xs font-semibold text-gray-400">
          {applicationIndex}
        </div>
        <div className="p-3">
          <input
            aria-label="Job title"
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            onBlur={() => queueApplicationSave(draft)}
            placeholder="Job title"
            className="job-cell-input font-semibold"
          />
        </div>
        <div className="p-3">
          <input
            aria-label="Company or hospital"
            value={draft.company}
            onChange={(event) => updateDraft("company", event.target.value)}
            onBlur={() => queueApplicationSave(draft)}
            placeholder="Company or hospital"
            className="job-cell-input text-gray-500 dark:text-gray-400"
          />
        </div>

        <div className="p-3">
          <StatusDropdown
            value={draft.status}
            onChange={(status) => {
              if (status !== "ALL") updateStatus(status);
            }}
          />
        </div>

        <div className="p-3">
          <input
            aria-label="Date applied"
            type="date"
            value={draft.dateApplied}
            onChange={(event) => updateDraft("dateApplied", event.target.value)}
            onBlur={() => queueApplicationSave(draft)}
            className="job-cell-input"
          />
        </div>

        <div className="p-3">
          <input
            aria-label="Location"
            value={draft.location}
            onChange={(event) => updateDraft("location", event.target.value)}
            onBlur={() => queueApplicationSave(draft)}
            placeholder="Location"
            className="job-cell-input"
          />
        </div>

        <div className="p-3">
          <input
            aria-label="Salary"
            value={draft.salary}
            onChange={(event) => updateDraft("salary", event.target.value)}
            onBlur={() => queueApplicationSave(draft)}
            placeholder="Salary"
            className="job-cell-input"
          />
        </div>

        <div className="p-3">
          <div className="flex items-center gap-1">
            <div className="relative min-w-0 flex-1">
              <Link2
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                aria-label="Application link"
                value={draft.applicationUrl}
                onChange={(event) =>
                  updateDraft("applicationUrl", event.target.value)
                }
                onBlur={() => queueApplicationSave(draft)}
                placeholder="Application link"
                className="job-cell-input !pl-7"
              />
            </div>
            {application?.applicationUrl && (
              <a
                href={application.applicationUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md p-2 text-gray-400 transition hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-800"
                aria-label="Open application link"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        <div className="p-3">
          <textarea
            aria-label="Notes"
            rows={1}
            value={draft.notes}
            onChange={(event) => updateDraft("notes", event.target.value)}
            onBlur={() => queueApplicationSave(draft)}
            placeholder="Notes"
            className="job-cell-input resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-1 p-3">
          {isSaving && (
            <LoaderCircle
              size={15}
              className="mr-1 animate-spin text-blue-500"
              aria-label="Saving changes"
            />
          )}
          <button
            type="button"
            onClick={() => setIsDeleteConfirmationOpen(true)}
            disabled={isSaving}
            className="rounded-md p-2 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/30"
            aria-label="Delete application"
            title="Delete application"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="flex min-w-[1430px] items-center gap-2 border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <CircleAlert size={14} />
          {errorMessage}
        </div>
      )}
      {isDeleteConfirmationOpen && (
        <DeleteConfirmationDialog
          application={application}
          isDeleting={isSaving}
          onCancel={() => setIsDeleteConfirmationOpen(false)}
          onConfirm={deleteApplication}
        />
      )}
    </div>
  );
}

function EmptyApplications({
  hasApplications,
}: {
  hasApplications: boolean;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
      <BriefcaseBusiness
        size={25}
        className="text-gray-300 dark:text-gray-600"
      />
      <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {hasApplications ? "No applications match" : "No applications yet"}
      </p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {hasApplications
          ? "Try a different search or status filter."
          : "Add your first application to get started."}
      </p>
    </div>
  );
}

export function JobTracker() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    JobApplicationStatus | "ALL"
  >("ALL");
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const [createError, setCreateError] = useState("");
  const [mobileApplicationToRevealId, setMobileApplicationToRevealId] =
    useState<string | null>(null);

  useEffect(() => {
    async function loadApplications() {
      try {
        const response = await fetch("/api/job-applications");
        if (!response.ok) throw new Error("Could not load applications");
        setApplications(await response.json());
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Could not load applications"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadApplications();
  }, []);

  const applicationCounts = useMemo(
    () =>
      JOB_APPLICATION_STATUSES.reduce(
        (counts, status) => {
          counts[status] = applications.filter(
            (application) => application.status === status
          ).length;
          return counts;
        },
        {} as Record<JobApplicationStatus, number>
      ),
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesStatus =
        statusFilter === "ALL" || application.status === statusFilter;
      const matchesSearch =
        !normalizedQuery ||
        [
          application.title,
          application.company,
          application.location,
          application.notes,
        ].some((fieldValue) =>
          fieldValue?.toLowerCase().includes(normalizedQuery)
        );
      return matchesStatus && matchesSearch;
    });
  }, [applications, searchQuery, statusFilter]);

  useEffect(() => {
    if (!mobileApplicationToRevealId) return;

    const animationFrameId = window.requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        const newApplicationElement = document.getElementById(
          `mobile-job-application-${mobileApplicationToRevealId}`
        );
        newApplicationElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        (
          newApplicationElement?.querySelector(
            'input[placeholder="Job title"]'
          ) as HTMLInputElement | null
        )?.focus({ preventScroll: true });
      }
      setMobileApplicationToRevealId(null);
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [filteredApplications, mobileApplicationToRevealId]);

  function handleSavedApplication(savedApplication: JobApplication) {
    setApplications((currentApplications) => {
      const applicationExists = currentApplications.some(
        (application) => application.id === savedApplication.id
      );
      return applicationExists
        ? currentApplications.map((application) =>
            application.id === savedApplication.id
              ? savedApplication
              : application
          )
        : [...currentApplications, savedApplication];
    });
  }

  function handleDeletedApplication(applicationId: string) {
    setApplications((currentApplications) =>
      currentApplications.filter(
        (application) => application.id !== applicationId
      )
    );
  }

  async function addApplication() {
    setIsCreatingApplication(true);
    setCreateError("");

    try {
      const response = await fetch("/api/job-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createEmptyDraft()),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || "Could not add application");
      }

      const newApplication: JobApplication = await response.json();
      setApplications((currentApplications) => [
        ...currentApplications,
        newApplication,
      ]);
      setStatusFilter("ALL");
      setSearchQuery("");
      setMobileApplicationToRevealId(newApplication.id);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Could not add application"
      );
    } finally {
      setIsCreatingApplication(false);
    }
  }

  return (
    <main className="job-tracker-bg min-h-0 flex-1 overflow-y-auto text-gray-900 dark:text-gray-50">
      <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-7 sm:px-6 lg:px-10 lg:pt-9">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
              Job tracker
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Edit any field directly in the table.
            </p>
          </div>
          <button
            type="button"
            onClick={addApplication}
            disabled={isCreatingApplication}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 sm:w-auto"
          >
            {isCreatingApplication ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <Plus size={17} />
            )}
            {isCreatingApplication ? "Adding…" : "Add application"}
          </button>
        </header>

        <section className="mt-5">
          {createError && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <CircleAlert size={15} />
              {createError}
            </div>
          )}
          <div className="flex flex-col gap-4 pb-5 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by role, company, location, or note…"
                className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-gray-700 dark:bg-gray-900 dark:focus:border-blue-600 dark:focus:ring-blue-950"
              />
            </div>
            <div className="hidden flex-wrap gap-2 sm:flex">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`job-filter-chip ${
                  statusFilter === "ALL" ? "job-filter-chip-active" : ""
                }`}
              >
                All <span>{applications.length}</span>
              </button>
              {JOB_APPLICATION_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`job-filter-chip ${
                    statusFilter === status ? "job-filter-chip-active" : ""
                  }`}
                >
                  <i className={statusDetails[status].dotClassName} />
                  {statusDetails[status].shortLabel}
                  <span>{applicationCounts[status]}</span>
                </button>
              ))}
            </div>
            <div className="sm:hidden">
              <StatusDropdown
                value={statusFilter}
                onChange={setStatusFilter}
                showBorder
                statusCounts={applicationCounts}
                allCount={applications.length}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-gray-500">
              <LoaderCircle size={19} className="mr-2 animate-spin" />
              Loading applications…
            </div>
          ) : loadError ? (
            <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 text-center text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              <CircleAlert size={22} />
              <p className="mt-2 font-semibold">{loadError}</p>
              <p className="mt-1 text-sm opacity-75">Try refreshing the page.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:block">
                <div className="job-table-grid min-w-[1430px] border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                  <div className="px-3 py-2.5 text-center">#</div>
                  <div className="px-3 py-2.5">Job title</div>
                  <div className="px-3 py-2.5">Company / hospital</div>
                  <div className="px-3 py-2.5">Status</div>
                  <div className="px-3 py-2.5">Date applied</div>
                  <div className="px-3 py-2.5">Location</div>
                  <div className="px-3 py-2.5">Salary</div>
                  <div className="px-3 py-2.5">Application</div>
                  <div className="px-3 py-2.5">Notes</div>
                  <div className="px-3 py-2.5 text-right">Actions</div>
                </div>

                {filteredApplications.map((application) => (
                  <ApplicationRow
                    key={application.id}
                    application={application}
                    applicationIndex={
                      applications.indexOf(application) + 1
                    }
                    view="desktop"
                    onSaved={handleSavedApplication}
                    onDeleted={handleDeletedApplication}
                  />
                ))}

                {filteredApplications.length === 0 && (
                  <EmptyApplications
                    hasApplications={applications.length > 0}
                  />
                )}
              </div>

              <div className="space-y-3 md:hidden">
                {filteredApplications.map((application) => (
                  <ApplicationRow
                    key={application.id}
                    application={application}
                    applicationIndex={
                      applications.indexOf(application) + 1
                    }
                    view="mobile"
                    onSaved={handleSavedApplication}
                    onDeleted={handleDeletedApplication}
                  />
                ))}

                {filteredApplications.length === 0 && (
                  <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                    <EmptyApplications
                      hasApplications={applications.length > 0}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
