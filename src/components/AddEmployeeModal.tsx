import { useState, useEffect } from "react";
import { X, Check, AlertCircle } from "lucide-react";
import { useLocations, useEmployee } from "../di/container";
import type { Location } from "../interfaces/LocationService";
import "../styles/LocationPageModals.css";

interface EmployeeFormData {
  employeeEmail: string;
  locationID: number;
}

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const emptyForm = (): EmployeeFormData => ({
  employeeEmail: "",
  locationID: 0,
});

export default function AddEmployeeModal({
  isOpen,
  onClose,
  onSuccess,
}: AddEmployeeModalProps) {
  const [form, setForm] = useState<EmployeeFormData>(emptyForm());
  const [locations, setLocations] = useState<Location[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const locationService = useLocations();
  const employeeService = useEmployee();

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const fetchLocations = async () => {
      const locationList = await locationService.getLocations();
      if (!active) return;
      setLocations(locationList);
      setForm((prev) => ({ ...prev, locationID: locationList[0]?.id ?? 0 }));
    };

    fetchLocations();
    return () => { active = false; };
  }, [isOpen, locationService]);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleClose = () => {
    setForm(emptyForm());
    setIsSuccess(false);
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    try {
      await employeeService.assignAdminLocation({
        email: form.employeeEmail,
        locationID: form.locationID,
      });
      onSuccess?.();
      setIsSuccess(true);
      setTimeout(handleClose, 1500);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    }
  };

  if (isSuccess) {
    return (
      <div className="modal-backdrop">
        <div className="modal-card">
          <div className="success-state">
            <div className="success-icon">
              <Check strokeWidth={3} size={22} color="#fff" />
            </div>
            <p className="success-title">Employee Added!</p>
            <p className="success-subtitle">
              {form.employeeEmail || "Employee"} has been added successfully.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="modal-card">
        <div className="top-section">
          <p>Add Employee</p>
          <button onClick={handleClose} aria-label="Close modal">
            <X />
          </button>
        </div>

        <div className="seperation-line" />

        {errorMessage && (
          <div className="error-banner">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="modal-form">
          <div className="form-group">
            <label className="form-label" htmlFor="employeeEmail">
              Employee Email
            </label>
            <input
              className="form-input"
              id="employeeEmail"
              type="email"
              placeholder="e.g. john@example.com"
              value={form.employeeEmail}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="locationID">
              Location
            </label>
            <select
              className="form-select"
              id="locationID"
              value={form.locationID}
              onChange={handleChange}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.Name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-cancel" onClick={handleClose}>
            Cancel
          </button>
          <button className="btn-submit" onClick={handleSubmit}>
            Add Employee
          </button>
        </div>
      </div>
    </div>
  );
}
