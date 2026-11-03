"use client";

import { useState } from "react";
import { archiveServiceAction, deleteCategoryAction, saveCategoryAction, saveServiceAction, saveStaffOverrideAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct } from "../../../components/app/useAct";
import { formObject } from "../../../lib/form";

type Override = { membershipId: string; price: string; activeBefore: string; processing: string; activeAfter: string };
type Svc = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  activeBefore: number;
  processing: number;
  activeAfter: number;
  bufferAfter: number;
  price: string;
  priceFrom: boolean;
  bookableOnline: boolean;
  active: boolean;
  staff: string[];
  overrides: Override[];
};

export function ServiceForm({ categories, staff, label, staffLabel, service }: { categories: { id: string; name: string }[]; staff: { id: string; name: string }[]; label: string; staffLabel: string; service?: Svc }) {
  const [open, setOpen] = useState(false);
  const [split, setSplit] = useState(Boolean(service && (service.processing || service.activeAfter)));
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className={service ? "btn btn-ghost btn-sm" : "btn btn-primary"} onClick={() => setOpen(true)}>{label}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={service ? `Edit ${service.name}` : label} wide>
        <form className="space-y-4" action={(f) => act(() => saveServiceAction(formObject(f)), () => setOpen(false))}>
          {service && <input type="hidden" name="id" value={service.id} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Name</span><input name="name" className="input" defaultValue={service?.name} required /></label>
            <label className="block">
              <span className="label">Category</span>
              <select name="categoryId" className="input" defaultValue={service?.categoryId ?? categories[0]?.id ?? "none"}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="none">No category</option>
              </select>
            </label>
          </div>
          <label className="block"><span className="label">Description shown online (optional)</span><textarea name="description" className="input" rows={2} defaultValue={service?.description} /></label>

          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Time</legend>
            <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Has processing time (color, treatments)</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="block"><span className="label">{split ? "Before processing" : "Length"} (min)</span><input name="activeBefore" type="number" min={0} max={600} className="input" defaultValue={service?.activeBefore ?? 45} required /></label>
              {split ? (
                <>
                  <label className="block"><span className="label">Processing (min)</span><input name="processing" type="number" min={0} max={600} className="input" defaultValue={service?.processing ?? 30} /></label>
                  <label className="block"><span className="label">After processing (min)</span><input name="activeAfter" type="number" min={0} max={600} className="input" defaultValue={service?.activeAfter ?? 30} /></label>
                </>
              ) : (
                <>
                  <input type="hidden" name="processing" value="0" />
                  <input type="hidden" name="activeAfter" value="0" />
                </>
              )}
              <label className="block"><span className="label">Cleanup after (min)</span><input name="bufferAfter" type="number" min={0} max={120} className="input" defaultValue={service?.bufferAfter ?? 0} /></label>
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Price</span><input name="price" inputMode="decimal" className="input" defaultValue={service?.price ?? ""} placeholder="60.00" /></label>
            <div className="space-y-1 pt-5 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="priceFrom" defaultChecked={service?.priceFrom} /> Starting price (shows $60+)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="bookableOnline" defaultChecked={service?.bookableOnline ?? true} /> Bookable online</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Active</label>
            </div>
          </div>

          <fieldset>
            <legend className="label">{staffLabel} who perform it (none picked means everyone)</legend>
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => (
                <label key={s.id} className="pill cursor-pointer border border-line bg-surface py-1">
                  <input type="checkbox" name="staff[]" value={s.id} defaultChecked={service?.staff.includes(s.id)} /> {s.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-between gap-2">
            {service ? (
              <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => act(() => archiveServiceAction({ id: service.id }), () => setOpen(false))}>Remove</button>
            ) : <span />}
            <button className="btn btn-primary" disabled={pending}>Save</button>
          </div>
        </form>

        {service && (
          <details className="mt-6 rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-semibold">Different price or time by person</summary>
            <p className="mt-2 text-xs text-muted">Leave blank to use the service&apos;s own price and time.</p>
            <div className="mt-2 space-y-2">
              {staff.filter((s) => !service.staff.length || service.staff.includes(s.id)).map((s) => {
                const o = service.overrides.find((x) => x.membershipId === s.id);
                return (
                  <form key={s.id} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-6" action={(f) => act(() => saveStaffOverrideAction(formObject(f)))}>
                    <input type="hidden" name="serviceId" value={service.id} />
                    <input type="hidden" name="membershipId" value={s.id} />
                    <span className="col-span-2 text-sm font-semibold sm:col-span-1">{s.name}</span>
                    <label className="block"><span className="label">Price</span><input name="price" className="input py-1" defaultValue={o?.price} /></label>
                    <label className="block"><span className="label">{split ? "Before" : "Length"}</span><input name="activeBefore" className="input py-1" defaultValue={o?.activeBefore} /></label>
                    {split && <label className="block"><span className="label">Processing</span><input name="processing" className="input py-1" defaultValue={o?.processing} /></label>}
                    {split && <label className="block"><span className="label">After</span><input name="activeAfter" className="input py-1" defaultValue={o?.activeAfter} /></label>}
                    <button className="btn btn-soft btn-sm" disabled={pending}>Save</button>
                  </form>
                );
              })}
            </div>
          </details>
        )}
      </Dialog>
    </>
  );
}

export function CategoryForm({ category }: { category?: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const { act, pending } = useAct();
  return (
    <>
      <button type="button" className={category ? "btn btn-ghost btn-sm" : "btn btn-soft"} onClick={() => setOpen(true)}>{category ? "Rename" : "New category"}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={category ? "Rename category" : "New category"}>
        <form className="space-y-3" action={(f) => act(() => saveCategoryAction(formObject(f)), () => setOpen(false))}>
          {category && <input type="hidden" name="id" value={category.id} />}
          <label className="block"><span className="label">Name</span><input name="name" className="input" defaultValue={category?.name} required /></label>
          <div className="flex justify-between">
            {category ? <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => act(() => deleteCategoryAction({ id: category.id }), () => setOpen(false))}>Delete category</button> : <span />}
            <button className="btn btn-primary" disabled={pending}>Save</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
