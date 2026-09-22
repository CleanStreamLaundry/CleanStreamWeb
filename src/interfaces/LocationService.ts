export interface LocationService {
    getLocations(): Promise<Location[]>
    fetchUserRole(): Promise<string | null> 
    getMachines(locationId: string): Promise<Machine[]>
    getWasherSizeRates(locationId: number): Promise<WasherSizeRate[]>
    saveWasherSizeRate(rate: WasherSizeRate): Promise<void|string>
    saveCortinaConfig(config: CortinaMachineConfig): Promise<void|string>
    addMachines(machine: Machine): Promise<void|string>
    addLocations(location:Location): Promise<void|string>
    deleteMachine(machineID: number): Promise<void>
}

export interface Location {
  id: number;
  Address: string;
  Name: string;
  Longitude: number;
  Latitude: number;
}

export interface Machine {
  id: number;
  Name: string;
  Price: number;
  Runtime: number;
  Status: string;
  Location_ID: number;
  Machine_type: string;
  Weight_kg: number;
  washer_size_rate_id?: number | null;
  cortina_machine_config?: CortinaMachineConfig | null;
}

export interface WasherSizeRate {
  id: number;
  location_id: number;
  size_label: string;
  capacity_kg: number;
  price_cents: number;
  is_active: boolean;
  review_required: boolean;
}

export interface CortinaMachineConfig {
  machine_id: number;
  public_machine_token?: string;
  nayax_terminal_id: string | null;
  nayax_uniqr: string | null;
  pulse_line_number: number | null;
  product_codes?: Record<string, number> | null;
  environment: "sandbox" | "production";
  is_enabled: boolean;
  review_required: boolean;
}
