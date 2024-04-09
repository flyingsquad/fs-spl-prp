/**	Prepare spells for DnD5e character.
 */

async function doDialog(dlg, msg, options) {
	let result;
	try {
		result = await Dialog.wait(dlg, {}, options);
	} catch (m) {
		ui.notifications.warn(m);
		return false;
	}
	return result;
}

function handleChoiceRender(sp, html) {
	html.on('change', html, (e) => {
		// Limit number of checked items, handle clicking items to show compendium data.
		let html = e.data;
		switch (e.target.nodeName) {
		case 'INPUT':
			if (e.target.type == 'checkbox') {
				let lim = html.find("#limit");
				let limit = lim[0].innerText;
				limit = parseInt(limit);
				let cnt = html.find("#count");
				let count = parseInt(cnt[0].innerText);
				if (e.target.checked)
					count++;
				else
					count--;
				if (count > limit) {
					e.target.checked = false;
					count--;
				}
				cnt.text(count);
			}
			break;
		}
	});
	html.on("click", ".showuuid", async (event) => {
		// Open the window for the item whose UUID was clicked.
		event.preventDefault();
		const uuid = event.currentTarget.getAttribute("uuid");
		if (!uuid) return;
		const item = await fromUuid(uuid);
		if (item) {
			item.sheet.render(true);
		}
	});
}

export class SpellPrep {

	totalSpells = 0;

	listSpells(actor) {
		
		// Get the class and set the number of spells that can be prpared.
		
		const classes = actor.items.filter(it => it.type == 'class');
		let classList = '';

		let limit = 0;

		classes.forEach((c) => {
			
			if (c.system.spellcasting.ability) {
				let mod;
				switch (c.name) {
				case 'Wizard':
				case 'Cleric':
				case 'Druid':
					mod = actor.system.abilities[c.system.spellcasting.ability].mod;
					limit = c.system.levels + mod;
					classList += `${limit}: ${c.name} ${c.system.levels} + ${mod} (${c.system.spellcasting.ability})`;
					break;
				case 'Artificer':
				case 'Paladin':
					mod = actor.system.abilities[c.system.spellcasting.ability].mod;
					limit = Math.max(1, Math.trunc(c.system.levels / 2) + mod);
					classList += `${limit}: ${c.name} ${c.system.levels} + ${mod} (${c.system.spellcasting.ability})`;
					break;
				default:
					classList += `${c.name} has no spell preparation.`;
				}
			}
		});
		
		let content;

		if (limit == 0) {
			content = classList;
		} else {
			let i = 1;
			let count = 0;
			
			let spellList = '';
			let ncols = 4;

			for (let level = 1; level <= 9; level++) {
				let spellTxt = "";
				let levcnt = 0;
				const spells = actor.items.filter(it => it.type == 'spell' && it.system.level === level);

				spells.sort((a, b) => {
					const nameA = a.name.toUpperCase();
					const nameB = b.name.toUpperCase();
					if (nameA < nameB)
						return -1;
					if (nameA > nameB)
						return 1;
					return 0;
				});

				spells.forEach((spell) => {
					let checked = "";
					if (spell.system.preparation.mode == 'prepared') {
						this.totalSpells++;
						if (spell.system.preparation.prepared) {
							checked = ' checked';
							count++;
						}

						let text = `<div class="vcenter">
							<input class="checkbox" type="checkbox" id="${this.totalSpells}" name="spell${this.totalSpells}" value="${spell.uuid}"${checked}></input>
							<label class="label" for="spell${this.totalSpells}"><a class="control showuuid" uuid="${spell.uuid}">${spell.name}</a></label>
							</div>\n`;
						spellTxt += text;
						levcnt++;
					}
				});
				if (spellTxt) {
					spellList += "<div>\n";
					spellList += `<div style="display: flex; flex-flow: row wrap">`;
					spellList += `<p><b>Level ${level}</b></p>`;
					spellList += `</div>`;
					
					spellList += `<div style="padding-bottom: 12px; display: flex; flex-flow: row wrap">`;
					spellList += spellTxt;
					for (let i = 0; i < levcnt % ncols; i++)
						spellList += `<div class="vcenter"></div>`;
					spellList += `</div>`;
					spellList += `</div>`;
				}
			}

			let colwidth = Math.trunc(100 / Math.min(ncols, 1+Math.trunc(this.totalSpells/10)));

			content = `<style>
				desc: {
					font-size: 12px;
				}
				.choices: {
					font-size: 12px;
					border-top: 1pt solid;
					border-bottom: 1pt solid;
					border-color: maroon;
				}
				.vcenter {
					align-items: center;
					display: flex;
					flex-grow: 1;
					width: ${colwidth}%;
				}
				.checkbox {
					font-size: 12px;
					flex-grow: 1;
				}
				.label {
					font-size: 12px;
					flex-grow: 4;
				}
			</style>\n`;

			content += `<div class="desc"><b>${classList}</b><br>Check the spells you wish to prepare. Cantrips, at-will, innate, always prepared and pact spells are not listed.</div>`;

			if (limit) {
				content += `<p class="modesto choices">Spells prepared: <span id="count">${count}</span> of <span id="limit">${limit}</span></p>`;
			}

			content += `<div style="height: 600px; padding-bottom: 12px; display: flex; flex-flow: row wrap; overflow-y: scroll">`;
			content += spellList;
			content += `</div><br>`;
		}
		return content;
	}

	actor = null;	

	async prepareSpells(actor) {
		
		async function prepSpells(actor, html, totalSpells) {
			let selections = [];
			for (let i = 1; i <= totalSpells; i++) {
				let cb = html.find(`#${i}`);
				if (cb.length == 0 || !cb[0].value)
					continue;
				let arr = cb[0].value.split(".");
				let id = arr[arr.length - 1];
				let spell = actor.items.find(s => s.id == id);
				if (spell && spell.system.preparation.prepared != cb[0].checked) {
					await actor.updateEmbeddedDocuments("Item",
						[{ "_id": id, "system.preparation.prepared": cb[0].checked }]
					);
				}
			}
		}

		this.actor = actor;
		console.log(`fs-spl-prp | preparing spells for ${this.actor.name}`);
		
		let content = this.listSpells(actor);
	
		let result = await doDialog({
		  title: "Prepare Spells",
		  content: content,
		  buttons: {
			ok: {
			  label: "Finished",
			  callback: async (html) => {
				  await prepSpells(actor, html, this.totalSpells);
				  return true;
			  },
			},
			cancel: {
				label: "Cancel",
				callback: (html) => { return false; }
			},
		  },
		  default: "ok",
		  close: () => { return false; },
		  render: (html) => {
				handleChoiceRender(this, html);
			 }
		}, "", {width: 800});
		
	}

	finish() {
		console.log(`fs-spl-prp | Finished preparing spells for ${this.actor.name}`);
	}


}


function insertActorHeaderButtons(actorSheet, buttons) {
  let actor = actorSheet.object;
  buttons.unshift({
    label: "Spell Prep",
    icon: "fas fa-star",
    class: "spl-prp",
    onclick: async () => {
		let sp;
		try {
			sp = new SpellPrep();
			if (!await sp.prepareSpells(actor))
				return false;

		} catch (msg) {
			ui.notifications.warn(msg);
		} finally {
			if (sp)
				sp.finish();
		}

    }
  });
}

Hooks.on("getActorSheetHeaderButtons", insertActorHeaderButtons);
