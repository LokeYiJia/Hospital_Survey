import React, { useEffect, useRef, useState } from "react";

const ROADSHOW_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Pulau Pinang", "Perak", "Perlis", "Selangor", "Terengganu",
  "Kuala Lumpur", "Putrajaya",
];
const ROADSHOW_LOCATIONS = [
  "Gleneagles",
  "Mahkota Medical Center",
  "KPJ Specialist Hospital",
  "Sunway Medical Center",
  "Hospital Seri Botani",
];
const AGE_BANDS = ["<25", "25-34", "35-44", "45-54", "55-64", "65+"];
const MARITAL_STATUSES = ["Single", "Married", "Married with children", "Divorced / widowed"];
const EMPLOYMENT_TYPES = ["Salaried", "Self-employed", "Business owner", "Homemaker", "Retired", "Student", "Others"];
const INCOME_BANDS = ["<RM3k", "RM3-6k", "RM6-10k", "RM10-20k", ">RM20k"];
const INSURANCE_PLANS = ["Medical Card", "Life / Term", "Critical Illness", "Savings", "Legacy", "Not sure", "I don’t have one"];
const FINANCIAL_PRIORITIES = [
  "Plan for kids’ education", "Build emergency fund", "Retirement savings",
  "Increase my savings", "Venture into investment", "Manage my debts better",
  "Reduce medical expenses risk", "Protect income if I cannot work",
  "Plan for legacy / estate planning", "Review and optimize current policies",
  "Accident and disability coverage", "Critical illness planning",
];

const initialForm = {
  date: "", roadshowLocation: "", roadshowState: "", fullName: "", emailAddress: "", mobileNumber: "", icNumber: "",
  agentName: "", agentId: "", agentEmail: "", gmName: "", currentInsuranceCompany: "",
  ageBand: "", maritalStatus: "", employmentType: "", employmentTypeOther: "",
  monthlyPersonalIncome: "", existingInsurancePlans: [], financialPriorities: [], consent: false,
};

const initialSubmissionDetails = {
  presentationDone: "", potentialFollowUp: "", onTheSpotCloseCase: "", anp: "",
};

function ChoiceGroup({ legend, name, options, value, onChange, required = true }) {
  return (
    <fieldset className="choice-group">
      <legend>{legend} {required && <span aria-hidden="true">*</span>}</legend>
      <div className="choices">
        {options.map((option) => (
          <label className="choice" key={option}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={onChange} required={required} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckboxGroup({ legend, name, options, values, onChange }) {
  return (
    <fieldset className="choice-group">
      <legend>{legend} <span aria-hidden="true">*</span></legend>
      <div className="choices checkbox-grid">
        {options.map((option) => (
          <label className="choice" key={option}>
            <input type="checkbox" name={name} value={option} checked={values.includes(option)} onChange={onChange} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function App() {
  const [form, setForm] = useState(initialForm);
  const [submissionDetails, setSubmissionDetails] = useState(initialSubmissionDetails);
  const [submissionId, setSubmissionId] = useState("");
  const [showSubmissionDetails, setShowSubmissionDetails] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const modalTitleRef = useRef(null);

  useEffect(() => {
    if (showSubmissionDetails) modalTitleRef.current?.focus();
  }, [showSubmissionDetails]);

  const update = ({ target }) => {
    const { name, value, type, checked } = target;
    if (status.message) setStatus({ type: "", message: "" });
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const updateArray = ({ target }) => {
    const { name, value, checked } = target;
    if (status.message) setStatus({ type: "", message: "" });
    setForm((current) => ({
      ...current,
      [name]: checked ? [...current[name], value] : current[name].filter((item) => item !== value),
    }));
  };

  const updateSubmissionDetail = ({ target }) => {
    const { name, value } = target;
    if (status.message) setStatus({ type: "", message: "" });
    setSubmissionDetails((current) => ({ ...current, [name]: value }));
  };

  const request = async (payload) => {
    const response = await fetch("/api/submit-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success !== true) {
      throw new Error(result.details || result.error || "Unable to submit the survey. Please try again.");
    }
    return result;
  };

  const createSubmission = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!form.existingInsurancePlans.length || !form.financialPriorities.length) {
      setStatus({ type: "error", message: "Select at least one insurance plan and one financial priority." });
      return;
    }
    if (form.employmentType === "Others" && !form.employmentTypeOther.trim()) {
      setStatus({ type: "error", message: "Please specify your employment type." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setStatus({ type: "loading", message: "Submitting lead details…" });
    try {
      const payload = {
        ...form,
        action: "create",
        employmentType: form.employmentType === "Others"
          ? `Others: ${form.employmentTypeOther.trim()}`
          : form.employmentType,
      };
      delete payload.employmentTypeOther;
      const result = await request(payload);
      if (!result.submissionId) throw new Error("The submission ID was not returned.");
      setSubmissionId(result.submissionId);
      setStatus({ type: "", message: "" });
      setShowSubmissionDetails(true);
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Unable to submit the survey. Please try again." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const completeSubmission = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const anp = submissionDetails.anp.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(anp)) {
      setStatus({ type: "error", message: "ANP must be a number with no more than two decimal places." });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setStatus({ type: "loading", message: "Saving submission details…" });
    try {
      await request({ action: "complete", submissionId, ...submissionDetails, anp });
      setForm(initialForm);
      setSubmissionDetails(initialSubmissionDetails);
      setSubmissionId("");
      setShowSubmissionDetails(false);
      setStatus({ type: "success", message: "Survey submitted successfully." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "Unable to submit the survey. Please try again." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <main className="page-shell">
      <form className="survey" onSubmit={createSubmission} autoComplete="off">
        <header className="survey-header"><h1>Register for Free PA Insurance</h1></header>

        <div className="form-layout">
          <section>
            <h2>1. Personal Details</h2>
            <div className="field-grid">
              <label className="field"><span>Full Name (as per NRIC) *</span><input name="fullName" value={form.fullName} onChange={update} required maxLength="150" autoComplete="off" /></label>
              <label className="field"><span>Email Address *</span><input name="emailAddress" type="email" value={form.emailAddress} onChange={update} required maxLength="254" inputMode="email" autoComplete="off" /></label>
              <label className="field"><span>Mobile Number *</span><input name="mobileNumber" type="tel" value={form.mobileNumber} onChange={update} required pattern="[+0-9 ]+" title="Use only numbers, spaces, and +" maxLength="30" inputMode="tel" autoComplete="off" /></label>
              <label className="field"><span>IC Number *</span><input name="icNumber" value={form.icNumber} onChange={update} required pattern="[A-Za-z0-9 -]+" title="Use letters, numbers, spaces, or hyphens" maxLength="30" inputMode="text" autoComplete="off" /></label>
              <label className="field full-width"><span>Current Insurance Company</span><input name="currentInsuranceCompany" value={form.currentInsuranceCompany} onChange={update} maxLength="150" placeholder="If applicable" autoComplete="off" /></label>
            </div>
          </section>

          <section>
            <h2>2. Your Profile</h2>
            <ChoiceGroup legend="Age Band" name="ageBand" options={AGE_BANDS} value={form.ageBand} onChange={update} />
            <ChoiceGroup legend="Marital Status" name="maritalStatus" options={MARITAL_STATUSES} value={form.maritalStatus} onChange={update} />
            <ChoiceGroup legend="Employment Type" name="employmentType" options={EMPLOYMENT_TYPES} value={form.employmentType} onChange={update} />
            {form.employmentType === "Others" && <label className="field conditional-field"><span>Please specify *</span><input name="employmentTypeOther" value={form.employmentTypeOther} onChange={update} required maxLength="100" autoComplete="off" /></label>}
            <ChoiceGroup legend="Monthly Personal Income" name="monthlyPersonalIncome" options={INCOME_BANDS} value={form.monthlyPersonalIncome} onChange={update} />
            <CheckboxGroup legend="Existing Insurance Plans" name="existingInsurancePlans" options={INSURANCE_PLANS} values={form.existingInsurancePlans} onChange={updateArray} />
            <CheckboxGroup legend="Financial Priorities in the next 12 months" name="financialPriorities" options={FINANCIAL_PRIORITIES} values={form.financialPriorities} onChange={updateArray} />
          </section>

          <section>
            <h2>3. For Agent Use</h2>
            <div className="field-grid">
              <label className="field"><span>Date *</span><input name="date" type="date" value={form.date} onChange={update} required autoComplete="off" /></label>
              <label className="field"><span>Roadshow Location *</span><select name="roadshowLocation" value={form.roadshowLocation} onChange={update} required autoComplete="off"><option value="" disabled>Select a location</option>{ROADSHOW_LOCATIONS.map((location) => <option value={location} key={location}>{location}</option>)}</select></label>
              <label className="field full-width"><span>Roadshow State *</span><select name="roadshowState" value={form.roadshowState} onChange={update} required autoComplete="off"><option value="" disabled>Select a state</option>{ROADSHOW_STATES.map((state) => <option value={state} key={state}>{state}</option>)}</select></label>
              <label className="field"><span>Agent Name *</span><input name="agentName" value={form.agentName} onChange={update} required maxLength="150" autoComplete="off" /></label>
              <label className="field"><span>Agent ID *</span><input name="agentId" value={form.agentId} onChange={update} required maxLength="80" autoComplete="off" /></label>
              <label className="field"><span>Agent Email *</span><input name="agentEmail" type="email" value={form.agentEmail} onChange={update} required maxLength="254" inputMode="email" autoComplete="off" /></label>
              <label className="field"><span>GM Name *</span><input name="gmName" value={form.gmName} onChange={update} required maxLength="150" autoComplete="off" /></label>
            </div>
          </section>

          <section>
            <h2>4. Consent &amp; Submission</h2>
            <label className="consent"><input type="checkbox" name="consent" checked={form.consent} onChange={update} required /><span>By participating in this survey and submitting your personal data, you consent to the collection, use, processing, and disclosure of your personal data for follow-up and advisory purposes.</span></label>
          </section>
        </div>

        <footer className="survey-footer">
          <button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit Survey"}</button>
          {status.message && !showSubmissionDetails && <p className={`status ${status.type}`} role={status.type === "error" ? "alert" : "status"} aria-live="polite">{status.message}</p>}
          <p className="prepared-by">*prepared by CFE department</p>
        </footer>
      </form>

      {showSubmissionDetails && (
        <div className="modal-backdrop">
          <form className="agent-modal" onSubmit={completeSubmission} role="dialog" aria-modal="true" aria-labelledby="submission-details-title" autoComplete="off">
            <h2 id="submission-details-title" ref={modalTitleRef} tabIndex="-1">Submission Details</h2>
            <p className="modal-intro">Complete these questions to finish the submission.</p>
            <ChoiceGroup legend="Presentation done" name="presentationDone" options={["Yes", "No"]} value={submissionDetails.presentationDone} onChange={updateSubmissionDetail} />
            <ChoiceGroup legend="Potential follow up" name="potentialFollowUp" options={["Yes", "No"]} value={submissionDetails.potentialFollowUp} onChange={updateSubmissionDetail} />
            <ChoiceGroup legend="On the spot close case" name="onTheSpotCloseCase" options={["Yes", "No"]} value={submissionDetails.onTheSpotCloseCase} onChange={updateSubmissionDetail} />
            <label className="field"><span>ANP *</span><input name="anp" value={submissionDetails.anp} onChange={updateSubmissionDetail} required pattern="[0-9]+(?:\.[0-9]{1,2})?" title="Enter a number with no more than two decimal places" maxLength="20" inputMode="decimal" placeholder="0.00" autoComplete="off" /></label>
            {status.message && <p className={`status ${status.type}`} role={status.type === "error" ? "alert" : "status"} aria-live="polite">{status.message}</p>}
            <div className="modal-actions"><button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Confirm & Submit"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
