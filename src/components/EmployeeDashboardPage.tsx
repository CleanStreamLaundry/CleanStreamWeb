import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import "../styles/EmployeePage.css";
import AddEmployeeModal from "./AddEmployeeModal";
import { useEmployee, useLocations } from "../di/container";
import type { EmployeeRecord } from "../interfaces/EmployeeService";
import DeleteEmployeeModal from "./DeleteEmployeeModal";

function EmployeePage() {
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [employeeList, setEmployeeList] = useState<EmployeeRecord[]>([]);
  const [employeeToRemove, setEmployeeToRemove] = useState<EmployeeRecord | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const employeeService = useEmployee();
  const locationService = useLocations();

  const loadEmployees = useCallback(async (isCurrent: () => boolean) => {
    const locations = await locationService.getLocations();
    if (!isCurrent()) return;
    const locationIDs = locations.map((location) => location.id);
    return employeeService.fetchEmployees(locationIDs);
  }, [employeeService, locationService]);
  const activeLoader = useRef<typeof loadEmployees | null>(null);
  const loadSequence = useRef(0);
  const selectionSequence = useRef(0);

  const selectEmployee = (employee: EmployeeRecord | null) => {
    ++selectionSequence.current;
    setEmployeeToRemove(employee);
  };

  useEffect(() => {
    let active = true;
    const request = ++loadSequence.current;
    const isCurrent = () => active && request === loadSequence.current;
    activeLoader.current = loadEmployees;
    const load = async () => {
      const employees = await loadEmployees(isCurrent);
      if (isCurrent() && employees) setEmployeeList(employees);
    };
    load();
    const loadRole = async () => {
      const role = await locationService.fetchUserRole();
      if (active) setUserRole(role!);
    };
    loadRole();
    return () => {
      active = false;
      activeLoader.current = null;
    };
  }, [loadEmployees, locationService]);

  const getEmployees = async () => {
    if (activeLoader.current !== loadEmployees) return;
    const request = ++loadSequence.current;
    const isCurrent = () => activeLoader.current === loadEmployees && request === loadSequence.current;
    const employees = await loadEmployees(isCurrent);
    if (isCurrent() && employees) setEmployeeList(employees);
  };

  const handleRemoveEmployee = async () => {
    if (!employeeToRemove) return;
    const selection = selectionSequence.current;
    try {
      await employeeService.removeAdminLocation(employeeToRemove.email);
      await getEmployees();
    } catch (error) {
      console.error("Failed to remove employee:", error);
    } finally {
      if (activeLoader.current === loadEmployees && selection === selectionSequence.current) {
        selectEmployee(null);
      }
    }
  };

  return (
    <div>
      <div className="sub-section">
        <button className="add-employee" onClick={() => setIsEmployeeModalOpen(true)}>
          <Plus size={15} />
          <p>Add Employee</p>
        </button>
      </div>

      <div className="employee-table-wrapper">
        <table className="employee-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Location ID</th>
              {userRole == "Owner" && <th>Delete</th>}
            </tr>
          </thead>
          <tbody>
            {employeeList.length === 0 && (
              <tr>
                <td colSpan={4} className="machine-empty-row">
                  No employees at this time.
                </td>
              </tr>
            )}
            {employeeList.map((employee, index) => (
              <tr key={index} className="machine-row">
                <td className="machine-name">{employee.name}</td>
                <td>
                  <span>{employee.email}</span>
                </td>
                <td>{employee.locationID}</td>
                {userRole == "Owner" && (
                  <td>
                    <button onClick={() => selectEmployee(employee)} className="delete-button">
                      <Trash2 />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddEmployeeModal onClose={() => setIsEmployeeModalOpen(false)} onSuccess={() => getEmployees()} isOpen={isEmployeeModalOpen} />
      <DeleteEmployeeModal employee={employeeToRemove} onConfirm={handleRemoveEmployee} onCancel={() => selectEmployee(null)} />
    </div>
  );
}

export default EmployeePage;
