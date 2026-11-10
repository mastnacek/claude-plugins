// project.ts — what a migration project is: a working folder that holds spec/rules/.
// One definition for every slice; the slices import it from here.

// A migration project is one whose working folder holds spec/rules/.

export type StatFs = { stat: (path: string) => Promise<{ kind: string }> };

export async function isMigrationProject(fs: StatFs): Promise<boolean> {
	try {
		return (await fs.stat("spec/rules")).kind === "dir";
	} catch {
		return false;
	}
}
