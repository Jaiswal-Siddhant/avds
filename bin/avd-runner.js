#!/usr/bin/env node

const { exec } = require('child_process');
const readline = require('readline');
const os = require('os');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv))
	.option('list', {
		alias: 'l',
		type: 'boolean',
		description: 'List all available Android Virtual Devices (AVDs)',
	})
	.help()
	.parse();

// Try to load inquirer with compatibility for different versions
let inquirer = null;
let useInquirer = false;

try {
	inquirer = require('inquirer');
	// Check if it's the newer ES module version
	if (inquirer.default) {
		inquirer = inquirer.default;
	}
	useInquirer = true;
} catch (error) {
	console.log('📦 Inquirer not found. Using built-in checkbox interface...\n');
}

class AVDLauncher {
	constructor() {
		this.avds = [];
		this.selectedAVDs = [];
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
	}

	async printAVDs() {
		try {
			const avds = await this.getAVDList();

			console.log('📱 Available Android Virtual Devices:\n');
			avds.forEach((avd, index) => {
				console.log(`${index + 1}. ${avd}`);
			});
			console.log(`\n📊 Total: ${avds.length} AVD(s)`);
		} catch (err) {
			process.exit(1);
		}
	}

	async getAVDList() {
		return new Promise((resolve, reject) => {
			console.log('🔍 Fetching available AVDs...\n');

			exec('emulator -list-avds', (error, stdout, stderr) => {
				if (error) {
					console.error('❌ Error fetching AVDs. Make sure Android SDK is installed and emulator is in PATH.');
					console.error('Error:', error.message);
					reject(error);
					return;
				}

				const avds = stdout.trim().split('\n').filter(avd => avd.trim() !== '');

				if (avds.length === 0) {
					console.log('⚠️  No AVDs found. Please create AVDs using Android Studio first.');
					reject(new Error('No AVDs found'));
					return;
				}

				resolve(avds);
			});
		});
	}

	// Built-in checkbox interface (fallback)
	async selectAVDsBuiltIn() {
		const selected = new Array(this.avds.length).fill(false);
		let currentIndex = 0;

		const displayMenu = () => {
			console.clear();
			console.log('🤖 Android AVD Multi-Launcher');
			console.log('==============================\n');
			console.log('📱 Select AVDs to launch:\n');
			console.log('Use ↑↓ to navigate, Space to select/deselect, Enter to confirm\n');

			this.avds.forEach((avd, index) => {
				const cursor = index === currentIndex ? '→ ' : '  ';
				const checkbox = selected[index] ? '☑️ ' : '☐ ';
				const highlight = index === currentIndex ? '\x1b[36m' : '\x1b[0m';
				const reset = '\x1b[0m';

				console.log(`${cursor}${highlight}${checkbox}${avd}${reset}`);
			});

			const selectedCount = selected.filter(Boolean).length;
			console.log(`\n📊 Selected: ${selectedCount} AVD(s)`);
			console.log('\n💡 Controls: ↑↓ Navigate | Space Select | Enter Confirm | q Quit');
		};

		return new Promise((resolve) => {
			displayMenu();

			const handleKeypress = (chunk, key) => {
				if (!key) return;

				switch (key.name) {
					case 'up':
						currentIndex = currentIndex > 0 ? currentIndex - 1 : this.avds.length - 1;
						displayMenu();
						break;

					case 'down':
						currentIndex = currentIndex < this.avds.length - 1 ? currentIndex + 1 : 0;
						displayMenu();
						break;

					case 'space':
						selected[currentIndex] = !selected[currentIndex];
						displayMenu();
						break;

					case 'return':
						const selectedAVDs = this.avds.filter((_, index) => selected[index]);
						if (selectedAVDs.length === 0) {
							console.log('\n❌ Please select at least one AVD.');
							setTimeout(() => displayMenu(), 1500);
						} else {
							process.stdin.setRawMode(false);
							process.stdin.removeListener('keypress', handleKeypress);
							this.selectedAVDs = selectedAVDs;
							resolve();
						}
						break;

					case 'q':
						console.log('\n👋 Goodbye!');
						process.exit(0);
						break;

					case 'c':
						if (key.ctrl) {
							console.log('\n👋 Goodbye!');
							process.exit(0);
						}
						break;
				}
			};

			process.stdin.setRawMode(true);
			process.stdin.resume();
			process.stdin.setEncoding('utf8');
			process.stdin.on('keypress', handleKeypress);
		});
	}

	// Inquirer-based selection
	async selectAVDsInquirer() {
		const choices = this.avds.map(avd => ({
			name: `📱 ${avd}`,
			value: avd,
			checked: false
		}));

		const questions = [
			{
				type: 'checkbox',
				name: 'selectedAVDs',
				message: 'Select AVDs to launch:',
				choices: choices,
				validate: (input) => {
					if (input.length === 0) {
						return 'Please select at least one AVD.';
					}
					return true;
				}
			}
		];

		const answers = await inquirer.prompt(questions);
		this.selectedAVDs = answers.selectedAVDs;

		console.log(`\n✅ Selected ${this.selectedAVDs.length} AVD(s):`);
		this.selectedAVDs.forEach(avd => console.log(`   ✓ ${avd}`));
		console.log();
	}

	async selectLaunchOptions() {
		if (this.selectedAVDs.length === 1) {
			return 'parallel';
		}

		if (useInquirer) {
			const questions = [
				{
					type: 'list',
					name: 'launchMode',
					message: 'How would you like to launch the AVDs?',
					choices: [
						{ name: '🚀 Launch all at once (faster)', value: 'parallel' },
						{ name: '⏱️  Launch with delay (more stable)', value: 'delayed' },
						{ name: '👆 Launch one by one (manual control)', value: 'sequential' }
					]
				}
			];

			const answers = await inquirer.prompt(questions);
			return answers.launchMode;
		} else {
			// Built-in selection
			return new Promise((resolve) => {
				console.log('How would you like to launch the AVDs?');
				console.log('1. 🚀 Launch all at once (faster)');
				console.log('2. ⏱️  Launch with delay (more stable)');
				console.log('3. 👆 Launch one by one (manual control)');

				this.rl.question('Enter your choice (1-3): ', (answer) => {
					switch (answer.trim()) {
						case '1': resolve('parallel'); break;
						case '2': resolve('delayed'); break;
						case '3': resolve('sequential'); break;
						default:
							console.log('Invalid choice. Using parallel launch.');
							resolve('parallel');
					}
				});
			});
		}
	}

	getEmulatorCommand(avdName) {
		const baseCommand = `emulator -avd "${avdName}"`;
		const platform = os.platform();

		switch (platform) {
			case 'win32':
				return `powershell -Command "Start-Process cmd -ArgumentList '/c','${baseCommand}' -WindowStyle Minimized -PassThru | Out-Null"`;
			// return `start /min "AVD: ${avdName}" cmd /k "${baseCommand}"`;
			case 'darwin': // macOS
				return `osascript -e 'tell app "Terminal" to do script "${baseCommand}"'`;
			case 'linux':
				return `gnome-terminal --title="AVD: ${avdName}" -- bash -c "${baseCommand}; exec bash" || xterm -title "AVD: ${avdName}" -e "${baseCommand}" || konsole --title "AVD: ${avdName}" -e "${baseCommand}"`;
			default:
				return baseCommand;
		}
	}

	async launchAVD(avdName) {
		return new Promise((resolve) => {
			console.log(`📱 Launching AVD: ${avdName}`);

			const command = this.getEmulatorCommand(avdName);

			const child = exec(command, (error) => {
				if (error) {
					console.error(`❌ Failed to launch ${avdName}:`, error.message);
				} else {
					console.log(`✅ Successfully launched ${avdName}`);
				}
				resolve();
			});

			child.on('error', (error) => {
				console.error(`❌ Failed to launch ${avdName}:`, error.message);
				resolve();
			});
		});
	}

	async launchAVDsParallel() {
		console.log('🚀 Starting all selected AVDs simultaneously...\n');

		const promises = this.selectedAVDs.map(avd => this.launchAVD(avd));
		await Promise.all(promises);
	}

	async launchAVDsDelayed() {
		console.log('⏱️  Starting AVDs with 3-second delays...\n');

		for (let i = 0; i < this.selectedAVDs.length; i++) {
			await this.launchAVD(this.selectedAVDs[i]);

			if (i < this.selectedAVDs.length - 1) {
				console.log('⏳ Waiting 3 seconds before next launch...\n');
				await new Promise(resolve => setTimeout(resolve, 3000));
			}
		}
	}

	async launchAVDsSequential() {
		console.log('👆 Launching AVDs one by one (press Enter to launch each)...\n');

		for (const avd of this.selectedAVDs) {
			if (useInquirer) {
				await inquirer.prompt([
					{
						type: 'input',
						name: 'continue',
						message: `Press Enter to launch: ${avd}`
					}
				]);
			} else {
				await new Promise((resolve) => {
					this.rl.question(`Press Enter to launch: ${avd} `, () => resolve());
				});
			}

			await this.launchAVD(avd);
			console.log();
		}
	}

	async confirmLaunch() {
		if (useInquirer) {
			const question = {
				type: 'confirm',
				name: 'proceed',
				message: '🚀 Proceed with launching the selected AVDs?',
				default: true
			};

			const answer = await inquirer.prompt([question]);
			return answer.proceed;
		} else {
			return new Promise((resolve) => {
				this.rl.question('🚀 Proceed with launching the selected AVDs? (y/n): ', (answer) => {
					resolve(answer.toLowerCase().startsWith('y'));
				});
			});
		}
	}

	async run() {
		try {
			if (!useInquirer) {
				console.clear();
			}
			console.log('🤖 Android AVD Multi-Launcher');
			console.log('==============================\n');

			// Get available AVDs
			this.avds = await this.getAVDList();

			// Let user select AVDs with appropriate interface
			if (useInquirer) {
				await this.selectAVDsInquirer();
			} else {
				await this.selectAVDsBuiltIn();
			}

			// Select launch mode
			const launchMode = await this.selectLaunchOptions();

			// Confirm before launching
			const confirmed = await this.confirmLaunch();

			if (confirmed) {
				console.log();

				switch (launchMode) {
					case 'parallel':
						await this.launchAVDsParallel();
						break;
					case 'delayed':
						await this.launchAVDsDelayed();
						break;
					case 'sequential':
						await this.launchAVDsSequential();
						break;
				}

				console.log('\n🎉 All selected AVDs have been launched!');
				console.log('💡 Each AVD is running in a separate terminal window.');
				console.log('📝 Note: It may take a few moments for the emulators to fully boot up.');

				// Option to launch more (only with inquirer)
				if (useInquirer) {
					const launchMore = await inquirer.prompt([
						{
							type: 'confirm',
							name: 'more',
							message: 'Would you like to launch more AVDs?',
							default: false
						}
					]);

					if (launchMore.more) {
						console.log('\n' + '='.repeat(50) + '\n');
						await this.run();
					}
				}

			} else {
				console.log('❌ Launch cancelled by user.');
			}

		} catch (error) {
			console.error('❌ An error occurred:', error.message);
			process.exit(1);
		} finally {
			if (!useInquirer) {
				this.rl.close();
			}
		}
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n\n👋 Goodbye!');
	process.exit(0);
});

process.on('SIGTERM', () => {
	console.log('\n\n👋 Goodbye!');
	process.exit(0);
});

// Main execution
if (require.main === module) {
	const launcher = new AVDLauncher();

	if (argv.list) {
		launcher.printAVDs().then(() => process.exit(0));
		return;
	}

	launcher.run().catch((error) => {
		console.error('💥 Fatal error:', error.message);
		process.exit(1);
	});
}

module.exports = AVDLauncher;