const fs = require("fs");
const { JWT } = require('google-auth-library');

/**
 * This is a helper for restoring backups accross projects according to
 * https://stackoverflow.com/questions/48620009/share-and-restore-cloud-sql-backup-files-across-account-project
 * and
 * https://cloud.google.com/sql/docs/mysql/backup-recovery/restoring#projectid
 *
 * Requires a service key JSON that is authorised
 */
class SqlRestore {
	/**
	 * Must be called first to prepare authorisation
	 * @param {string} path Path to json service key
	 */
	authorizeJwt(path) {
		const serviceAccount = JSON.parse(fs.readFileSync(path, 'utf8'));
		const googleJWTClient = new JWT(
			serviceAccount.client_email,
			null,
			serviceAccount.private_key,
			['https://www.googleapis.com/auth/cloud-platform'],
			null
		);

		this.googleClient = googleJWTClient;
	}

	/**
	 * List all backups for an instance
	 * @param {string} opts.projectId
	 * @param {string} opts.instanceId
	 * @returns {object[]} List of backup runs for the instance
	 */
	async listBackups({ projectId, instanceId }) {
		const url = `https://www.googleapis.com/sql/v1beta4/projects/${projectId}/instances/${instanceId}/backupRuns`;
		try {
			const response = await this.googleClient.request({
				url,
				method: 'GET',
			});
			return response.data.items;
		} catch (error) {
			console.error(error);
			throw error;
		}
	}

	/**
	 * Restore a backup from one instance to another instance
	 * @param {string} opts.sourceProjectId
	 * @param {string} opts.targetProjectId
	 * @param {string} opts.sourceInstanceId
	 * @param {string} opts.targetInstanceId
	 * @param {string} opts.backupRunId
	 */
	async restoreBackup(opts) {
		const {
			sourceProjectId,
			targetProjectId,
			sourceInstanceId,
			targetInstanceId,
			backupRunId,
		} = opts;

		const url = `https://www.googleapis.com/sql/v1beta4/projects/${targetProjectId}/instances/${targetInstanceId}/restoreBackup`;
		const data = {
			restoreBackupContext: {
				backupRunId,
				project: sourceProjectId,
				instanceId: sourceInstanceId,
			},
		};

		const result = await this.googleClient.request({
			url,
			data,
			method: 'POST',
		});
		return result.data;
	}

	/**
	 * Shortcut to find the latest successful backup from the source and restore it to target
	 * @param {string} opts.sourceProjectId
	 * @param {string} opts.targetProjectId
	 * @param {string} opts.sourceInstanceId
	 * @param {string} opts.targetInstanceId
	 * @returns {object} An operation object
	 */
	async restoreLatestBackup(opts) {
		const { sourceProjectId, sourceInstanceId } = opts;

		const backups = await this.listBackups({
			projectId: sourceProjectId,
			instanceId: sourceInstanceId,
		});
		if (!backups.length) {
			throw new Error(
				'No backups were found on the source, cannot restore'
			);
		}
		const sortedBackups = backups
			.filter((b) => b.status === 'SUCCESSFUL')
			.sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
		return this.restoreBackup({
			...opts,
			backupRunId: sortedBackups[0].id,
		});
	}

	/**
	 * Get operations for a project (and optionally an instance)
	 * @param {string} opts.projectId
	 * @param {string} opts.instanceId optional
	 * @returns {object[]} Operations
	 */
	async listOperations({ projectId, instanceId, maxResults }) {
		if (!maxResults) maxResults = 10;
		let url = `https://www.googleapis.com/sql/v1beta4/projects/${projectId}/operations?maxResults=${maxResults}`;
		if (instanceId) url += `&instance=${instanceId}`;
		const operations = await this.googleClient.request({
			url,
			method: 'GET',
		});
		return operations.data.items;
	}

	/**
	 * Check the status of a restore operation
	 * @param {object} operation Returned by restore
	 * @returns {object} Updated operation
	 * @throws {Error} if the operation contains an error
	 */
	async checkOperationStatus(operation) {
		const url = operation.selfLink;
		const update = await this.googleClient.request({ url, method: 'GET' });

		const data = update.data;

		if (data.error) {
			const error = new Error(data.error[0].errors[0].message);
			error.original = data.error;
			throw error;
		}
		return data;
	}
}

module.exports = SqlRestore;
