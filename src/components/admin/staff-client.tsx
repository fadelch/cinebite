"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { STAFF_ROLES } from "@/validation/settings";
import { useNotifications } from "@/components/ui/notification-provider";
import { settingsCall } from "./settings-client";
import type { StaffDto, StaffListDto, StaffRole } from "@/types/settings";

function RoleLabel({ role }: { role: StaffRole }) {
  return <span>{role.replaceAll("_", " ")}</span>;
}
export function StaffListClient({
  initial,
  query,
}: {
  initial: StaffListDto;
  query: {
    search?: string;
    role?: string;
    status?: string;
    locationId?: string;
  };
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value) params.set(key, value);
  function pageHref(page: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return "/admin/staff?" + next;
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-amber-400 uppercase">
            Cinema administration
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Staff management</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Own-cinema identities, current roles and location permissions. No
            public staff signup or hard deletion.
          </p>
        </div>
        <Link href="/admin/staff/invite" className="cb-button-primary min-h-11">
          Invite staff
        </Link>
      </header>
      <form
        method="get"
        action="/admin/staff"
        className="cb-panel grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5"
      >
        <label className="text-sm text-zinc-300">
          Search name/email
          <input
            name="search"
            defaultValue={query.search ?? ""}
            className="cb-field mt-2"
            maxLength={100}
          />
        </label>
        <label className="text-sm text-zinc-300">
          Role
          <select
            name="role"
            defaultValue={query.role ?? ""}
            className="cb-field mt-2"
          >
            <option value="">All roles</option>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {role.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-300">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className="cb-field mt-2"
          >
            <option value="">All statuses</option>
            {["ACTIVE", "INVITED", "SUSPENDED"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-300">
          Location
          <select
            name="locationId"
            defaultValue={query.locationId ?? ""}
            className="cb-field mt-2"
          >
            <option value="">All locations</option>
            {initial.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="cb-button-primary min-h-11" type="submit">
            Apply filters
          </button>
          <Link className="cb-button-secondary min-h-11" href="/admin/staff">
            Reset
          </Link>
        </div>
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        {initial.items.map((staff) => (
          <article key={staff.id} className="cb-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold">
                  {staff.displayName}
                  {staff.self ? (
                    <span className="ml-2 text-xs text-zinc-500">You</span>
                  ) : null}
                </h2>
                <p className="mt-1 break-all text-sm text-zinc-400">
                  {staff.email}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs ${staff.status === "SUSPENDED" ? "border-rose-400/25 text-rose-300" : staff.status === "INVITED" ? "border-amber-400/25 text-amber-300" : "border-emerald-400/25 text-emerald-300"}`}
              >
                {staff.status}
              </span>
            </div>
            <p className="mt-4 text-sm text-zinc-300">
              <RoleLabel role={staff.role} />
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {staff.organizationWide
                ? "All organization locations"
                : staff.locations.map((l) => l.name).join(" · ")}
            </p>
            {staff.identitySyncPending ? (
              <p className="mt-2 text-xs text-amber-300">
                Identity synchronization pending; current PostgreSQL permissions
                remain enforced.
              </p>
            ) : null}
            <Link
              href={`/admin/staff/${staff.id}`}
              className="cb-button-secondary mt-4 min-h-11"
            >
              View staff & permissions
            </Link>
          </article>
        ))}
      </div>
      {!initial.items.length ? (
        <section className="cb-panel p-8 text-center">
          <h2 className="font-semibold">No staff match these filters</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Reset filters or invite a staff member into your cinema.
          </p>
        </section>
      ) : null}
      <nav
        aria-label="Staff pagination"
        className="flex flex-wrap items-center justify-end gap-3"
      >
        <p className="text-sm text-zinc-500">
          Page {initial.page} · {initial.total} staff
        </p>
        {initial.page > 1 ? (
          <Link
            href={pageHref(initial.page - 1)}
            className="cb-button-secondary"
          >
            Previous
          </Link>
        ) : null}
        {initial.total > initial.page * initial.pageSize ? (
          <Link
            href={pageHref(initial.page + 1)}
            className="cb-button-secondary"
          >
            Next
          </Link>
        ) : null}
      </nav>
      <section className="cb-panel p-5 text-sm leading-6 text-zinc-400">
        <h2 className="font-semibold text-zinc-200">
          Secure account lifecycle
        </h2>
        <p className="mt-2">
          Firebase owns passwords and setup/reset links. CineBite stores no
          passwords or reset tokens. PostgreSQL checks role, active state and
          location access on every protected request. Email addresses are
          read-only after invitation. Invited users do not count as replacement
          administrators until successful sign-in.
        </p>
      </section>
    </div>
  );
}
function PrivateSetup({
  link,
  onClose,
}: {
  link: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    toast = useNotifications();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="private-setup-title"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-zinc-100 backdrop:bg-black/75"
    >
      <h2 id="private-setup-title" className="text-xl font-semibold">
        Private staff account setup
      </h2>
      <p className="mt-4 text-sm leading-6 text-zinc-400">
        A Firebase setup link was generated. No invitation email was sent. Share
        the link privately with this staff member; never put it in screenshots,
        source control or public chat. It is not saved in CineBite.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className="cb-button-primary"
          onClick={() => {
            if (!navigator.clipboard) {
              toast.error(
                "Clipboard is unavailable on this connection. Open the private Firebase setup link securely.",
              );
              return;
            }
            void navigator.clipboard
              .writeText(link)
              .then(() => toast.success("Private link copied. Share securely."))
              .catch(() =>
                toast.error(
                  "Clipboard unavailable. Open the private setup link securely.",
                ),
              );
          }}
        >
          Copy private setup link
        </button>
        <a
          href={link}
          rel="noopener noreferrer"
          target="_blank"
          className="cb-button-secondary"
        >
          Open Firebase setup
        </a>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="cb-button-secondary"
        >
          Close private setup
        </button>
      </div>
    </dialog>
  );
}
export function StaffForm({
  locations,
  initial,
  onSaved,
}: {
  locations: StaffListDto["locations"];
  initial?: StaffDto;
  onSaved?: (staff: StaffDto) => void;
}) {
  const [name, setName] = useState(initial?.displayName ?? ""),
    [email, setEmail] = useState(initial?.email ?? ""),
    [role, setRole] = useState<StaffRole>(initial?.role ?? "KITCHEN_STAFF"),
    [ids, setIds] = useState(initial?.locations.map((l) => l.id) ?? []),
    [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState<string | null>(null),
    [created, setCreated] = useState<StaffDto | null>(null);
  const router = useRouter(),
    toast = useNotifications(),
    reduced = useReducedMotion();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!initial && !review) {
      setReview(true);
      return;
    }
    setBusy(true);
    try {
      if (initial) {
        const staff = await settingsCall<StaffDto>(
          `/api/admin/staff/${initial.id}`,
          {
            displayName: name,
            role,
            locationIds: role === "CINEMA_ADMIN" ? [] : ids,
            revision: initial.revision,
            confirmedRoleChange: confirm,
          },
        );
        onSaved?.(staff);
        toast.success(
          staff.identitySyncPending
            ? "Permissions saved. Identity synchronization needs a retry."
            : "Staff permissions saved. Role changes require a fresh sign-in.",
        );
      } else {
        const result = await settingsCall<{
          staff: StaffDto;
          setupLink: string;
        }>("/api/admin/staff", {
          displayName: name,
          email,
          role,
          locationIds: role === "CINEMA_ADMIN" ? [] : ids,
        });
        setCreated(result.staff);
        setSetup(result.setupLink);
        toast.success(
          "Staff invited. Share the private setup link; no email delivery is claimed.",
        );
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || Boolean(initial && !initial.canManage);
  return (
    <>
      <form
        method="post"
        onSubmit={(event) => void save(event)}
        className="cb-panel space-y-6 p-6"
        aria-label={initial ? "Edit staff permissions" : "Invite staff form"}
      >
        <header>
          <h2 className="text-xl font-semibold">
            {initial
              ? "Profile & permissions"
              : review
                ? "Review invitation"
                : "Staff details"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {initial
              ? "Email is read-only. Role/access changes are checked against current tenant authorization."
              : "Create a staff identity in this organization only. No public signup, password entry or automatic email delivery."}
          </p>
        </header>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">
            Display name
            <input
              name="displayName"
              className="cb-field mt-2"
              value={name}
              maxLength={120}
              required
              minLength={2}
              disabled={locked || (!initial && review)}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="text-sm text-zinc-300">
            Staff email{initial ? " (read-only)" : ""}
            <input
              name="email"
              className="cb-field mt-2"
              value={email}
              type="email"
              required
              disabled={locked || Boolean(initial) || review}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </div>
        <label className="block text-sm text-zinc-300">
          Staff role
          <select
            aria-label="Staff role"
            className="cb-field mt-2"
            name="role"
            value={role}
            disabled={locked || review || Boolean(initial?.self)}
            onChange={(event) => {
              const next = event.target.value as StaffRole;
              setRole(next);
              if (next === "CINEMA_ADMIN") setIds([]);
              setConfirm(false);
            }}
          >
            {STAFF_ROLES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {role === "CINEMA_ADMIN" ? (
          <p className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm leading-6 text-amber-200">
            Cinema Admin grants organization-wide access, staff administration
            and branding/settings management. Platform SUPER_ADMIN is never an
            assignable role.
          </p>
        ) : (
          <fieldset className="rounded-xl border border-zinc-800 p-4">
            <legend className="px-2 text-sm font-semibold">
              Authorized locations — choose at least one
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {locations.map((location) => (
                <label
                  key={location.id}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(location.id)}
                    disabled={locked || review}
                    onChange={(event) =>
                      setIds((current) =>
                        event.target.checked
                          ? [...current, location.id]
                          : current.filter((id) => id !== location.id),
                      )
                    }
                  />
                  {location.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {initial && initial.role !== role ? (
          <label className="flex items-start gap-3 rounded-xl border border-amber-400/25 p-4 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
              disabled={locked}
            />
            <span>
              I confirm this role change and the resulting access. Existing role
              sessions become invalid; the staff member must sign in again.
            </span>
          </label>
        ) : null}
        {review && !initial ? (
          <motion.section
            initial={false}
            layout={!reduced}
            className="rounded-xl border border-zinc-800 bg-zinc-950 p-5"
          >
            <h3 className="font-semibold">Review before inviting</h3>
            <p className="mt-3 break-words text-zinc-300">{name}</p>
            <p className="mt-1 break-all text-sm text-zinc-400">{email}</p>
            <p className="mt-3 text-sm text-amber-300">
              <RoleLabel role={role} />
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {role === "CINEMA_ADMIN"
                ? "All organization locations"
                : locations
                    .filter((l) => ids.includes(l.id))
                    .map((l) => l.name)
                    .join(" · ") ||
                  "No locations selected — return and choose a location."}
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              The setup link will be private. No email has been sent.
            </p>
          </motion.section>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {review && !initial ? (
            <button
              type="button"
              onClick={() => setReview(false)}
              className="cb-button-secondary"
              disabled={busy}
            >
              Back to details
            </button>
          ) : null}
          <button
            type="submit"
            disabled={locked || Boolean(created)}
            className="cb-button-primary min-h-11"
          >
            {busy
              ? "Saving…"
              : initial
                ? "Save staff permissions"
                : review
                  ? "Confirm invitation"
                  : "Review invitation"}
          </button>
          <Link href="/admin/staff" className="cb-button-secondary min-h-11">
            Staff list
          </Link>
        </div>
        {initial?.self ? (
          <p className="text-xs text-zinc-500">
            Your own role is locked; self-demotion and self-suspension are not
            allowed.
          </p>
        ) : null}
      </form>
      {setup ? (
        <PrivateSetup
          link={setup}
          onClose={() => {
            setSetup(null);
            if (created) router.push(`/admin/staff/${created.id}`);
          }}
        />
      ) : null}
    </>
  );
}
export function InviteStaffClient({
  locations,
}: {
  locations: StaffListDto["locations"];
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/admin/staff" className="text-sm text-amber-300">
        ← Staff management
      </Link>
      <header>
        <p className="text-xs tracking-wide text-amber-400 uppercase">
          Secure staff administration
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Invite staff</h1>
      </header>
      <StaffForm locations={locations} />
    </div>
  );
}
export function StaffDetailClient({
  initial,
  locations,
}: {
  initial: StaffDto;
  locations: StaffListDto["locations"];
}) {
  const [staff, setStaff] = useState(initial),
    [action, setAction] = useState<"SUSPEND" | "REACTIVATE" | "SETUP" | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    toast = useNotifications();
  useEffect(() => {
    if (action) dialog.current?.showModal();
  }, [action]);
  async function confirm() {
    setBusy(true);
    try {
      if (action === "SETUP") {
        const result = await settingsCall<{
          staff: StaffDto;
          setupLink: string;
        }>(`/api/admin/staff/${staff.id}/setup`, {
          revision: staff.revision,
          confirmed: true,
        });
        setStaff(result.staff);
        dialog.current?.close();
        setSetup(result.setupLink);
      } else {
        setStaff(
          await settingsCall(`/api/admin/staff/${staff.id}/status`, {
            revision: staff.revision,
            active: action === "REACTIVATE",
            confirmed: true,
          }),
        );
        dialog.current?.close();
        toast.success(
          action === "SUSPEND"
            ? "Staff suspended. Historical records are preserved."
            : "Staff reactivated with only the displayed role/location access.",
        );
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    try {
      const result = await settingsCall<StaffDto>(
        `/api/admin/staff/${staff.id}/sync`,
        {},
      );
      setStaff(result);
      if (result.identitySyncPending)
        toast.error(
          "Identity sync is still pending. Retry after the provider or existing lease is available.",
        );
      else toast.success("Identity synchronized. Staff must sign in again.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/staff" className="text-sm text-amber-300">
        ← Staff management
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-wide text-amber-400 uppercase">
            Staff account
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold">
            {staff.displayName}
          </h1>
          <p className="mt-2 break-all text-sm text-zinc-400">{staff.email}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Joined{" "}
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "UTC",
              dateStyle: "medium",
            }).format(new Date(staff.joinedAt))}{" "}
            (UTC)
          </p>
        </div>
        <span className="rounded-full border border-zinc-700 px-4 py-2 text-sm">
          {staff.status}
        </span>
      </header>
      <StaffForm
        key={staff.revision}
        initial={staff}
        locations={locations}
        onSaved={setStaff}
      />
      {staff.identitySyncPending ? (
        <section className="cb-panel p-5">
          <h2 className="font-semibold text-amber-300">
            Identity synchronization pending
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Current PostgreSQL authorization is already enforced. Stale
            role/security-version sessions fail closed until Firebase claims
            synchronize and the user signs in again.
          </p>
          <button
            type="button"
            className="cb-button-secondary mt-4"
            disabled={busy || !staff.canManage}
            onClick={() => void sync()}
          >
            Retry identity sync
          </button>
        </section>
      ) : null}
      <section
        className="cb-panel border-rose-400/15 p-6"
        aria-label="Sensitive account actions"
      >
        <h2 className="text-xl font-semibold">Sensitive account actions</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Suspension blocks subsequent protected requests without waiting only
          for Firebase token expiry. Historical orders, refunds, stock movements
          and audits remain linked to this identity. There is no hard-delete
          action.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || !staff.canManage || staff.self}
            className="cb-button-secondary min-h-11 text-rose-300"
            onClick={() =>
              setAction(staff.status === "SUSPENDED" ? "REACTIVATE" : "SUSPEND")
            }
          >
            {staff.status === "SUSPENDED"
              ? "Reactivate staff"
              : "Suspend staff"}
          </button>
          <button
            type="button"
            disabled={busy || !staff.canManage || staff.status === "SUSPENDED"}
            className="cb-button-secondary min-h-11"
            onClick={() => setAction("SETUP")}
          >
            Restart private account setup
          </button>
        </div>
      </section>
      <section className="cb-panel p-6">
        <h2 className="text-xl font-semibold">Relevant audit history</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Latest 20 staff lifecycle events. No credential or reset-link metadata
          is displayed.
        </p>
        <ol className="mt-5 space-y-3">
          {staff.audits?.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-zinc-800 p-4"
            >
              <p className="text-sm font-semibold">
                {event.action.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-sm text-zinc-400">{event.summary}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {event.actor} ·{" "}
                {new Date(event.createdAt).toLocaleString("en-GB", {
                  timeZone: "UTC",
                })}{" "}
                UTC
              </p>
            </li>
          ))}
        </ol>
        {!staff.audits?.length ? (
          <p className="mt-4 text-sm text-zinc-500">
            No recorded Phase 18 staff events yet.
          </p>
        ) : null}
      </section>
      <dialog
        ref={dialog}
        onClose={() => setAction(null)}
        aria-labelledby="staff-action-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-zinc-700 bg-zinc-950 p-6 text-zinc-100 backdrop:bg-black/75"
      >
        <h2 id="staff-action-title" className="text-xl font-semibold">
          {action === "SUSPEND"
            ? `Suspend ${staff.displayName}?`
            : action === "REACTIVATE"
              ? `Reactivate ${staff.displayName}?`
              : "Generate a new private setup link?"}
        </h2>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          {action === "SUSPEND"
            ? "This staff member immediately loses server-authorized access. Historical records are preserved. At least one active Cinema Admin must remain."
            : action === "REACTIVATE"
              ? "Only the configured role and current location grants will become active. Old sessions stay invalid; a fresh sign-in is required."
              : "Share the Firebase link privately. No email delivery is claimed. Passwords and setup URLs are never stored in CineBite or audit metadata."}
        </p>
        <p className="mt-4 text-sm text-amber-300">
          <RoleLabel role={staff.role} /> ·{" "}
          {staff.organizationWide
            ? "All organization locations"
            : staff.locations.map((l) => l.name).join(" · ")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            className="cb-button-secondary min-h-11"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className="cb-button-primary min-h-11"
            onClick={() => void confirm()}
          >
            {action === "SUSPEND"
              ? "Confirm suspension"
              : action === "REACTIVATE"
                ? "Confirm reactivation"
                : "Generate private setup"}
          </button>
        </div>
      </dialog>
      {setup ? (
        <PrivateSetup link={setup} onClose={() => setSetup(null)} />
      ) : null}
    </div>
  );
}
