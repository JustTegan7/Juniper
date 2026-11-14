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

## Decisions (2026-11-13)
- Provider: Gusto is the default recommendation (Simple plan was $49 a month plus $6 per person in 2026, single state). Its payroll import reads a CSV with names and regular, overtime and double overtime hours, so one generic export works. Any provider that imports a CSV can use it.
- Hourly and salary both supported. No tips or commission in v1.
- Pay rates are private to owners. Managers cannot see them.
- Estimates are optional per business (off by default), since they do not fit every business. A second switch lets each person see only their own.
- The hours export carries no rates, so a manager can run it.
- Juniper never stores bank or routing numbers.
