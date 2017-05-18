import { AuthenticationContext } from "adal-node";
import { KeyVaultClient, KeyVaultCredentials } from "azure-keyvault";
import { azureKeyvault } from "./settings";

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
	 * This is used to ensure that only GitHub can send messages to our server.
	 * This should match the secret value set on GitHub: https://github.com/DefinitelyTyped/DefinitelyTyped/settings/hooks
	 * The Payload URL should be the URL of the Azure service.
	 * The webhook ignores the `sourceRepository` setting and can be triggered by *anything* with the secret,
	 * so make sure only DefinitelyTyped has the secret.
	 */
	GITHUB_SECRET,
	/**
	 * Token used to perform request to NPM's API.
	 * This was generated by doing:
	 * - `npm login`
	 * - copy the token value (comes after `authToken=`) in `~/.npmrc`
	 * - `rm ~/.npmrc` (don't want to accidentally log out this token.)
	 *
	 * We only need one token in existence, so delete old tokens at: https://www.npmjs.com/settings/tokens
	 */
	NPM_TOKEN
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
	const secretUrl = `${azureKeyvault}/secrets/${azureSecretName(secret)}`;

	return new Promise<string>((resolve, reject) => {
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
	const clientId = process.env.TYPES_PUBLISHER_CLIENT_ID;
	const clientSecret = process.env.TYPES_PUBLISHER_CLIENT_SECRET;
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
			callback(undefined, `${tokenResponse!.tokenType} ${tokenResponse!.accessToken}`);
		});
	});

	return new KeyVaultClient(credentials);
}
