# Database Design

## Scope and assumptions

This application implements a focused Registry module.

- Each student has one current programme and academic year.
- Each student has one assigned fee obligation and can make multiple
  payments against it.
- Fees are not modelled as annual or semester billing schedules.
- Assessments are available to students in the matching programme
  and academic year.
- Access uses a demo Staff/Student selector, without real authentication.
- All amounts use one application-wide currency, documented in the UI.
- Academic years use a consistent YYYY/YYYY format.

## Tables

| Table | Main fields |
| --- | --- |
| Programme | id, name, defaultFee |
| Student | id, studentNumber, fullName, email, dateOfBirth, programmeId, academicYear, status |
| FeeAssignment | id, studentId, amount, dueDate |
| Payment | id, feeAssignmentId, amount, paymentDate, reference |
| Assessment | id, programmeId, academicYear, title, module, deadline |
| Submission | id, studentId, assessmentId, storagePath, originalFilename, size, submittedAt |
| Result | id, submissionId, grade, publishedAt |

All tables have createdAt. Mutable records also have updatedAt.
Payments are append-only in this assessment.

## Relationships and uniqueness

- Programme has many students and assessments.
- Programme name is unique.
- Student email is trimmed, normalised to lowercase and unique.
- Student number is unique and generated using a database sequence.
- Each student has one FeeAssignment: studentId is unique.
- FeeAssignment has many payments.
- Payment reference is required, trimmed and unique within its
  fee assignment.
- Submission has a unique combination of studentId and assessmentId.
- Result has a unique submissionId.

Student numbers use SMS-<enrolment year>-<sequence>.
The sequence does not reset annually. Gaps are acceptable.

## Students and fees

- Supported statuses: Enrolled, Deferred, Withdrawn and Completed.
- Creating a student also creates their fee assignment in one transaction.
- The assigned amount snapshots the programme's current default fee.
- Later programme price changes do not change existing assigned fees.
- Programme or academic-year changes are blocked once the student
  has payments or submissions.
- Before that point, corrections update the enrolment and assigned
  programme fee together.
- Fee due date is entered directly by staff during enrolment and allows
  past dates to accommodate backdated student registrations.
- The application does not offer hard deletion of student records.

## Payment integrity

- Monetary columns use Decimal, not floating-point database types.
- Money calculations use decimal-safe arithmetic.
- Fees cannot be negative.
- Payments must be positive.
- Payments cannot exceed the current outstanding balance.
- Recording a payment uses a transaction with concurrency protection.
- Repeated payment requests must not create duplicate transactions.
- Payment history is retained.

Outstanding balance is calculated from the assigned fee minus payments.
A positive balance is overdue after the fee's due date.

## Submissions

- Students have one current submission per assessment.
- Resubmission updates the existing Submission record.
- Resubmission is allowed only before the deadline.
- First submissions at or after the deadline are accepted and flagged
  as late.
- Server time determines deadline eligibility.
- On resubmission, submittedAt records the replacement submission time.
- Any existing Result is removed when the submission is replaced.
- The submission update and result removal occur in one transaction.
- Files are private; access requires server-side permission checks.
- Storage and database changes require failure cleanup because they
  cannot share a database transaction.

Lateness is calculated by comparing submittedAt with the deadline.

## Results

- Staff can grade submitted work from 0 to 100.
- A missing Result means ungraded.
- publishedAt = null means withheld.
- A publication timestamp means published.
- Editing a published grade resets publishedAt to null.
- There is no separate isPublished Boolean.
- Students only receive published results from the server.

Classification is calculated from the grade:

- Below 40: Fail
- 40 to below 60: Pass
- 60 to below 70: Merit
- 70 to 100: Distinction

## Enforcement

- Database constraints enforce uniqueness and relationships.
- Database check constraints enforce positive payment amounts,
  non-negative fees and the grade range.
- Zod validates request inputs.
- Server operations enforce role, ownership and business rules.
- Transactions protect operations involving related records.
- Balance, classification and lateness are calculated rather than
  stored as duplicate values.

## Deliberate exclusions

No separate Staff, User, Module, AcademicYear, PaymentMethod,
SubmissionHistory or AuditLog tables are required for this scope.

Full enrolment history, instalment schedules, refunds and payment
correction workflows are outside the assessment scope.

## Student number implementation

studentNumber is a unique database-generated integer sequence.
enrolmentYear is stored separately and remains fixed.

The displayed ID combines them as SMS-<year>-<padded sequence>.
Padding is a minimum of four digits; larger numbers are not truncated.