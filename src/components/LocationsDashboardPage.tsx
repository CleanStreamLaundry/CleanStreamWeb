import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/LocationsPage.css";
import { Plus, QrCode, Trash2 } from "lucide-react";
import { useLocations } from "../di/container";
import type { Location, Machine } from "../interfaces/LocationService";
import AddMachineModal from "./AddMachineModal";
import AddLocationModal from "./AddLocationModal";
import DeleteMachineModal from "./DeleteMachineModal";
import WasherRatesPanel from "./WasherRatesPanel";
import CortinaConfigModal from "./CortinaConfigModal";

const MACHINE_TYPES = ["Washer", "Dryer"];

function LocationsPage() {
  const [locationData, setLocationData] = useState<Location[]>([]);
  const [machineData, setMachineData] = useState<Machine[]>([]);
  const [userRole, setUserRole] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [machineToDelete, setMachineToDelete] = useState<Machine | null>(null);
  const [machineToConfigure, setMachineToConfigure] = useState<Machine | null>(null);
  const locationService = useLocations();
  const { getMachines, getLocations, fetchUserRole } = locationService;
  const requests = useRef({ machine: 0, location: 0 });
  const currentLocation = useRef("");
  const active = useRef(false);

  const fetchMachines = useCallback(async (locationId: string) => {
    if (!active.current || currentLocation.current !== locationId) return;
    const request = ++requests.current.machine;
    try {
      const machines = await getMachines(locationId);
      if (active.current && request === requests.current.machine) setMachineData(machines);
    } catch (error) {
      if (active.current && request === requests.current.machine) console.error("Failed to fetch machines:", error);
    }
  }, [getMachines]);

  const fetchLocations = useCallback(async () => {
    const request = ++requests.current.location;
    try {
      const locations = await getLocations();
      if (!active.current || request !== requests.current.location) return;
      setLocationData(locations);
      const firstLocation = locations[0];
      if (firstLocation) {
        currentLocation.current = "";
        ++requests.current.machine;
        setSelectedLocation("");
      }
    } catch (error) {
      if (active.current && request === requests.current.location) console.error("Failed to fetch locations:", error);
    }
  }, [getLocations]);

  useEffect(() => {
    active.current = true;
    const sequence = requests.current;
    let current = true;
    const loadInitialData = async () => {
      const locations = fetchLocations();
      try {
        const role = await fetchUserRole();
        if (current) setUserRole(role ?? "");
      } catch (error) {
        if (current) console.error("Failed to fetch user role:", error);
      }
      await locations;
    };
    void loadInitialData();
    return () => {
      current = false;
      active.current = false;
      ++sequence.location;
      ++sequence.machine;
    };
  }, [fetchLocations, fetchUserRole, getMachines]);

  const handleLocationChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const locationId = e.target.value;
    currentLocation.current = locationId;
    ++requests.current.machine;
    setSelectedLocation(locationId);
    await fetchMachines(locationId);
  };

  const handleDeleteMachine = async () => {
    if (!machineToDelete) return;
    const request = requests.current.machine;
    try {
      await locationService.deleteMachine(machineToDelete.id);
      if (active.current && request === requests.current.machine) await fetchMachines(selectedLocation);
    } catch (error) {
      console.error("Failed to delete machine:", error);
    } finally {
      if (active.current) setMachineToDelete(current => current === machineToDelete ? null : current);
    }
  };

  return (
    <div>
      <div className="top-section">
        <select className="locations-list" name="Location List" value={selectedLocation} onChange={handleLocationChange}>
          <option value="">Select a location</option>
          {locationData.map((location, index) => (
            <option key={index} value={location.id.toString()}>
              {location.Name}
            </option>
          ))}
        </select>
        {userRole == "Owner" && (
          <div className="sub-section">
            <p>Add Location:</p>
            <button name="Add location button" onClick={() => setIsLocationModalOpen(true)}>
              <Plus />
            </button>
          </div>
        )}
      </div>

      <div className="seperation-line"></div>

      {userRole === "Owner" && selectedLocation && <WasherRatesPanel locationId={Number(selectedLocation)} onChanged={() => fetchMachines(selectedLocation)} />}

      <div className="machine-description">
        <p>Machines:</p>
        {userRole == "Owner" && (
          <div className="sub-section">
            <button onClick={() => setIsMachineModalOpen(true)}>
              <Plus size={15} />
              <p>Add Machine</p>
            </button>
          </div>
        )}
      </div>

      <div className="machine-table-wrapper">
        <table className="machine-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Weight</th>
              {userRole == "Owner" && <th>Payments</th>}
              {userRole == "Owner" && <th>Delete</th>}
            </tr>
          </thead>
          <tbody>
            {machineData.length === 0 && (
              <tr>
                <td colSpan={userRole === "Owner" ? 6 : 4} className="machine-empty-row">
                  No machines at this location.
                </td>
              </tr>
            )}
            {machineData.map((machine, index) => (
              <tr key={index} className="machine-row">
                <td className="machine-name">{machine.Name}</td>
                <td>{machine.Machine_type}</td>
                <td>
                  <span>{machine.Status}</span>
                </td>
                <td>{machine.Weight_kg} kg</td>
                {userRole == "Owner" && <td><button onClick={() => setMachineToConfigure(machine)} className="icon-action" title="Cortina and QR setup" aria-label={`Configure payments for ${machine.Name}`}><QrCode /></button></td>}
                {userRole == "Owner" && (
                  <td>
                    <button onClick={() => setMachineToDelete(machine)} className="delete-button">
                      <Trash2 />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddMachineModal
        isOpen={isMachineModalOpen}
        onClose={() => setIsMachineModalOpen(false)}
        onSuccess={() => fetchMachines(selectedLocation)}
        machineTypes={MACHINE_TYPES}
        locations={locationData.map((l) => ({
          id: l.id,
          name: l.Name,
        }))}
      />
      <AddLocationModal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} onSuccess={() => fetchLocations()} />

      <DeleteMachineModal machine={machineToDelete} onConfirm={handleDeleteMachine} onCancel={() => setMachineToDelete(null)} />
      <CortinaConfigModal machine={machineToConfigure} onClose={() => setMachineToConfigure(null)} onSuccess={() => fetchMachines(selectedLocation)} />
    </div>
  );
}

export default LocationsPage;
