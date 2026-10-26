import type {AuthService} from "../../interfaces/AuthService";
import {AuthenticationResponse} from "../enum/authentication_responses";
import {SupabaseClient, type Session} from "@supabase/supabase-js";

export class AuthRepository implements AuthService {

    private session: Session | null = null;
    private userID: string | null = null;

    constructor(private client: SupabaseClient) {}

    login = async (email: string, password: string): Promise<AuthenticationResponse> => {
        this.session = null;
        this.userID = null;
        let output: AuthenticationResponse = AuthenticationResponse.success;

        const {data, error } = await this.client.auth.signInWithPassword({
            email: email,
            password: password
        });


        if(data.user === null || error){
            output = AuthenticationResponse.failure
        }else{
            const response: AuthenticationResponse = await this.getRole(data.user?.id)
            if(response !== AuthenticationResponse.success){
                return response;
            }
 
            // Save the session
            if (data.session != null) {
                this.session = data.session;
            }

            //Save the userID
            this.userID = data.user.id;

        }

        return output;
    }

    async getRole(userID: string | undefined): Promise<AuthenticationResponse> {
        let output: AuthenticationResponse;

        const {data,error} = await this.client
            .from('profiles')
            .select("roles")
            .eq('id', userID)
            .single();

        if (error) return AuthenticationResponse.failure;

        if(data != null) {
            if (data.roles === "Admin" || data.roles === "Owner") {
                output = AuthenticationResponse.success;
            }else{
                output = AuthenticationResponse.invalidPermissions;
            }
        }else{
            output = AuthenticationResponse.failure;
        }

        return output;
    }

    isSession = async (): Promise<boolean> => {
        return this.session != null;
    };

    getUserID = async (): Promise<string | null> => {
        return this.userID;
    }

    restoreSession = async (): Promise<AuthenticationResponse> => {
        this.session = null;
        this.userID = null;
        try {
            const {data, error} = await this.client.auth.getSession();

            if (error || !data.session) {
                return AuthenticationResponse.failure;
            }

            const roleResponse = await this.getRole(data.session.user.id);
            if (roleResponse !== AuthenticationResponse.success) {
                return roleResponse;
            }

            this.session = data.session;
            this.userID = data.session.user.id;

            return AuthenticationResponse.success;
        } catch {
            return AuthenticationResponse.failure;
        }
    }

    signOut = async (): Promise<void> => {
        await this.client.auth.signOut();
    }
}
