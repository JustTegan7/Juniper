# Paychecks and direct deposit

## What already exists
- Time clock with meal and rest break rules (WA defaults), weekly overtime, and flags for missed breaks.
- Timesheets by pay period (weekly, every two weeks, twice a month), with a CSV export.
- Pay period and overtime settings in Settings.

## What is missing
1. Pay rates per person (hourly or salary), so a timesheet can show estimated gross pay.
2. Direct deposit and real paychecks.

## Decision: Juniper does not run payroll
Paying people means withholding and filing taxes, issuing W-2s, moving money by ACH, and holding bank details. That is regulated work and a liability. A payroll provider (Gusto, ADP, Check, Patriot, QuickBooks Payroll) already does it. Juniper's job is to hand that provider clean hours.

- **Bank and routing numbers are never stored in Juniper.** Employees enter them in the payroll provider.
- **Direct deposit setup** in Juniper is a link to the provider's employee sign-in, shown on each person's profile.

## Proposed build (small, safe)
1. **Pay profile per person** (managers and owners see it, the person sees their own): pay type (hourly or salary), rate, and an optional note. Stored on the membership. Changes are audited.
2. **Timesheet gross estimate**: regular hours x rate plus overtime x 1.5, per person per pay period, labeled "estimate, before taxes". Washington overtime rules already in the timesheet code.
3. **Payroll export**: one CSV per pay period with name, regular hours, overtime hours, breaks owed, and rate, in the column layout a chosen provider imports. Which provider decides the layout.
4. **Payroll link setting**: the provider's name and sign-in URL, shown to employees under "My pay".
5. **Employee "My pay" page**: their own hours for the period, estimated gross, and the provider link. Nothing about other people.

## Not building
Tax withholding, tax filing, pay stubs, W-2s, ACH, storing bank details, tip pooling.

## Open questions for Tegan
- Which payroll provider will Evergreen and its clients use? This picks the export layout.
- Hourly only, or salaried people too?
- Should employees see their own estimated pay, or only managers?
- Tips and commission (salon use) in v1, or later?
