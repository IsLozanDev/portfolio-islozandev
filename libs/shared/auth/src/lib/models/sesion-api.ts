/** Sesión que devuelve la API al ingresar o al verificar el MFA (spec 18b); va a `supabase.auth.setSession`. */
export interface SesionApiRespuesta {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'bearer';
}
