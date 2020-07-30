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
		const serviceAccount = JSON.parse(fs.readFileSync(path, "utf8"));
		const googleJWTClient = new JWT(
			serviceAccount.client_email,
			null,
			serviceAccount.private_key,
			[
				'https://www.googleapis.com/auth/cloud-platform',
			],
			null
		);

		this.googleClient = googleJWTClient;
	}

	/**
	 * List all backups for an instance
	 * @param {string} opts.projectId
	 * @param {string} opts.instanceId
	 * @returns {unclear}
	 */
	async listBackups({ projectId, instanceId }) {
		const url = `https://www.googleapis.com/sql/v1beta4/projects/${projectId}/instances/${instanceId}/backupRuns`;
		try {
			const response = await this.googleClient.request({ url, method: "GET" });
			return response.data.items;
		} catch (error) {
			console.log(error);
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

		return this.googleClient.request({ url, data, method: "POST" });
	}

	/**
	 * Shortcut to find the latest backup from the source and restore it to target
	 * @param {string} opts.sourceProjectId
	 * @param {string} opts.targetProjectId
	 * @param {string} opts.sourceInstanceId
	 * @param {string} opts.targetInstanceId
	 */
	async restoreLatestBackup(opts) {
		const {
			sourceProjectId,
			sourceInstanceId,
		} = opts;

		const backups = await this.listBackups({
			projectId: sourceProjectId,
			instanceId: sourceInstanceId,
		});
		if (!backups.length) {
			throw new Error("No backups were found on the source, cannot restore");
		}
		const sortedBackups = backups.sort((a, b) =>
			a.startTime > b.startTime ? -1 : 1
		);
		return this.restoreBackup({
			...opts,
			backupRunId: sortedBackups[0].id,
		});
	}
}

module.exports = SqlRestore;
