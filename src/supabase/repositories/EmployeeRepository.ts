import { SupabaseClient } from "@supabase/supabase-js";
import { useAuth as getAuthService } from "../../di/container";
import type { EmployeeService, AdminForm, EmployeeRecord } from "../../interfaces/EmployeeService";


export class EmployeeRepository implements EmployeeService {
    constructor(private client: SupabaseClient) { }

    assignAdminRole = async (email: string): Promise<string> => {
        const { data: userData, error: userError } = await this.client
            .from("profiles")
            .update({ roles: 'Admin' })
            .eq("email", email)
            .select('id')

        if (userError) {
            console.error(userError);
            throw new Error(userError.message);
        }
        return userData[0]?.id
    }

    assignAdminLocation = async (form: AdminForm): Promise<void> => {
        const userID = await this.assignAdminRole(form.email)
        if(userID === "") throw new Error("Could not find that user")
        const { error: assignError } = await this.client
            .from("Location_to_Admin")
            .insert({ location_id: form.locationID, user_id: userID })

        if (assignError) {
            console.error(assignError);
            throw new Error(assignError.message);
        }
    }

    fetchEmployees = async (locationIDs: number[]): Promise<EmployeeRecord[]> => {
        const authService = getAuthService()
        const Uuid = await authService.getUserID()
        const { data: employeeData, error: employeeDataError } = await this.client
            .from("Location_to_Admin")
            .select(`
                location_id,
                profiles (
                    full_name,
                    email
                )
            `)
            .neq("user_id", Uuid)
            .in("location_id", locationIDs)

        if (employeeDataError) {
            console.error(employeeDataError);
            throw new Error(employeeDataError.message);
        }

            return employeeData.map(entry => {
            const profile = entry.profiles as unknown as { full_name: string; email: string };
            return {
                locationID: entry.location_id,
                name: profile?.full_name,
                email: profile?.email,
            };
        })
        }

    removeAdminLocation = async (email: string): Promise<void> => {
            const EmployeeID = await this.removeAdminRole(email)
            const {error: deleteEmployeeError} = await this.client
            .from('Location_to_Admin')
            .delete()
            .eq('user_id', EmployeeID)

            if (deleteEmployeeError) {
            console.error(deleteEmployeeError);
            throw new Error(deleteEmployeeError.message);
            }
        }

    removeAdminRole = async (email: string): Promise<string> => {
        const { data: userData, error: userError } = await this.client
            .from("profiles")
            .update({ roles: 'User' })
            .eq("email", email)
            .select('id')

        if (userError) {
            console.error(userError);
            throw new Error(userError.message);
        }
        return userData[0]?.id
    }
}
