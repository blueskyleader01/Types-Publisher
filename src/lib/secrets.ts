import { KeyVaultClient, KeyVaultCredentials } from "azure-keyvault";
import { AuthenticationContext } from "adal-node";
import { settings } from "./common";

export enum Secret {
	/**
	 * Used to upload blobs.
	 * To find (or refresh) this value, go to https://ms.portal.azure.com -> All resources -> typespublisher -> General -> Access keys
	 */
	AZURE_STORAGE_ACCESS_KEY,
	/**
	 * Lets the server update an issue (https://github.com/Microsoft/types-publisher/issues/40) on GitHub in case of an error.
	 * Create a token at: https://github.com/settings/tokens
	 */
	GITHUB_ACCESS_TOKEN,
	/**
	 * This is used to ensure that only GitHub cand send messages to our server.
	 * This should match the secret value set on GitHub: https://github.com/DefinitelyTyped/DefinitelyTyped/settings/hooks
	 * The Payload URL should be the URL of the Azure service.
	 * The webhook ignores the `sourceRepository` setting and can be triggered by *anything* with the secret, so make sure only DefinitelyTyped has the secret.
	 */
	GITHUB_SECRET,
	/** Password for settings.npmUsername */
	NPM_PASSWORD
}

export const allSecrets: Secret[] =
	Object.keys(Secret)
		.map(key => (Secret as any)[key])
		.filter(x => typeof x === "number");

/**
 * Convert `AZURE_STORAGE_ACCESS_KEY` to `azure-storage-access-key`.
 * For some reason Azure wouldn't allow secret names with underscores.
 */
function azureSecretName(secret: Secret): string {
	return Secret[secret].toLowerCase().replace(/_/g, "-");
}

export function getSecret(secret: Secret): Promise<string> {
	const client = getClient();
	const secretUrl = `${settings.azureKeyvault}/secrets/${azureSecretName(secret)}`;

	return new Promise((resolve, reject) => {
		client.getSecret(secretUrl, (error, bundle) => {
			if (error) {
				reject(error);
			} else {
				resolve(bundle!.value);
			}
		});
	});
}

function getClient(): KeyVaultClient {
	const clientId = process.env["TYPES_PUBLISHER_CLIENT_ID"];
	const clientSecret = process.env["TYPES_PUBLISHER_CLIENT_SECRET"];
	if (!(clientId && clientSecret)) {
		throw new Error("Must set the TYPES_PUBLISHER_CLIENT_ID and TYPES_PUBLISHER_CLIENT_SECRET environment variables.");
	}

	// Authenticator - retrieves the access token
	const credentials = new KeyVaultCredentials((challenge, callback) => {
		// Create a new authentication context.
		const context = new AuthenticationContext(challenge.authorization);

		// Use the context to acquire an authentication token.
		context.acquireTokenWithClientCredentials(challenge.resource, clientId, clientSecret, (error, tokenResponse) => {
			if (error) {
				throw error;
			}

			// Calculate the value to be set in the request's Authorization header and resume the call.
			callback(null, `${tokenResponse!.tokenType} ${tokenResponse!.accessToken}`);
		});
	});

	return new KeyVaultClient(credentials);
}
