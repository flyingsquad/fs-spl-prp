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

async function showHelp(sp) {
	const htmlContent = await renderTemplate('/modules/fs-spl-prp/help.hbs');
	await doDialog({
		title: "Prepare Spells Help",
		content: htmlContent,
		buttons: {
			ok: {
				label: "OK",
				callback: (html) => { ; }
			},
		}
	}, "", {width: 600})	
}

export class SpellPrep {

	totalSpells = 0;
	castClasses = [];
	curClass = "";
	
	recount(sp, html) {
		let i;
		for (i = 0; i < this.castClasses.length; i++)
			this.castClasses[i].count = 0;

		for (i = 1; i <= this.totalSpells; i++) {
			let ctrl = html.find(`#${i}`);
			if (!ctrl)
				continue;
			if (!ctrl[0]?.checked)
				continue;
			if (this.castClasses.length == 1)
				this.castClasses[0].count++;
			else {
				let ctrl = html.find(`#cls${i}`);
				if (ctrl) {
					let cls = ctrl[0].value;
					let c = this.castClasses.find(cc => cc.abbrev == cls);
					if (c)
						c.count++;
				}
			}
		}
		
		for (i = 0; i < this.castClasses.length; i++) {
			let cnt = html.find(`#count${this.castClasses[i].abbrev}`);
			if (cnt)
				cnt.text(this.castClasses[i].count);
		}		
	}

	handleChoiceRender(sp, html) {
		html.on('change', html, (e) => {
			// Limit number of checked items, handle clicking items to show compendium data.
			let html = e.data;
			switch (e.target.nodeName) {
			case 'INPUT':
				if (e.target.type == 'checkbox') {
					let cls;
					if (this.castClasses.length > 1) {
						// Get the class assigned to the spell.
						let ctrl = html.find(`#cls${e.target.id}`);
						if (ctrl)
							cls = ctrl[0].value;
					} else {
						// Only one class for the spell.
						cls = this.castClasses[0].abbrev;
					}
					let lim = html.find(`#limit${cls}`);
					let limit = lim[0].innerText;
					limit = parseInt(limit);
					let cnt = html.find(`#count${cls}`);
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
			case 'SELECT':
				// Changed the class. Just recount everything.
				// FIX: optimize by not recounting if not checked.
				let id = e.target.id;
				let value = e.target.value;
				this.recount(sp, html);
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
		html.on("click", ".showhelp", async (event) => {
			showHelp(sp);
			event.preventDefault();
		});
	}


	listSpells(actor) {
		
		// Get the class and set the number of spells that can be prpared.
		
		const classes = actor.items.filter(it => it.type == 'class');
		let classList = '';

		let limit = 0;
		let cobj;
		let abbreviations = {};
		abbreviations['Artificer'] = 'Art';
		abbreviations['Cleric'] = 'Clr';
		abbreviations['Druid'] = 'Drd';
		abbreviations['Paladin'] = 'Pal';
		abbreviations['Wizard'] = 'Wiz';

		classes.forEach((c) => {
			
			if (c.system.spellcasting.ability) {
				let mod;
				let abil;
				switch (c.name) {
				case 'Wizard':
				case 'Cleric':
				case 'Druid':
					abil = actor.system.abilities[c.system.spellcasting.ability].value;
					mod = actor.system.abilities[c.system.spellcasting.ability].mod;
					let value = actor.system.abilities[c.system.spellcasting.ability].value;
					limit = c.system.levels + mod;
					classList += `${c.name} ${c.system.levels} + ${mod} (${c.system.spellcasting.ability} ${value})`;

					cobj = {name: c.name, limit: limit, level: c.system.levels, ability: c.system.spellcasting.ability, abil: abil, mod: mod, count: 0};
					cobj.abbrev = abbreviations[c.name];
					this.curClass = cobj.abbrev;
					this.castClasses.push(cobj);
					break;

				case 'Artificer':
				case 'Paladin':
					abil = actor.system.abilities[c.system.spellcasting.ability].value;
					mod = actor.system.abilities[c.system.spellcasting.ability].mod;
					limit = Math.max(1, Math.trunc(c.system.levels / 2) + mod);
					classList += `${limit}: ${c.name} ${c.system.levels} + ${mod} (${c.system.spellcasting.ability})`;

					cobj = {name: c.name, limit: limit, level: c.system.levels, ability: c.system.spellcasting.ability, abil: abil, mod: mod, count: 0};
					cobj.abbrev = abbreviations[c.name];
					this.curClass = cobj.abbrev;
					this.castClasses.push(cobj);
					break;

				default:
					classList += `${c.name} has no spell preparation.`;
					break;
				}
			}
		});
		
		let content;
		let atwill = false;
		let innate = false;
		let always = false;
		let pact = false;
		
		let nrows = 0;

		if (limit == 0) {
			content = classList;
		} else {
			let i = 1;
			let count = 0;
			
			let spellList = '';
			let ncols = this.castClasses.length > 1 ? 3 : 4;

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
					if (levcnt++ % ncols == 0) {
						spellTxt += `<tr>\n`;
						nrows++;
					}
					this.totalSpells++;
					let cls = spell.flags['fs-spl-prp']?.cls;
					if (!cls)
						cls = this.castClasses[0].abbrev;
					let classSel = "";
					let checkbox = "";

					switch (spell.system.preparation.mode) {
					case 'prepared':
						if (spell.system.preparation.prepared) {
							let c = this.castClasses.find(cc => cc.abbrev == cls);
							if (c)
								c.count++;
							checked = ' checked';
						}

						if (this.castClasses.length > 1) {
							classSel = `\n<select id="cls${this.totalSpells}">\n`;
							for (let i = 0; i < this.castClasses.length; i++) {
								let selected = '';
								if (cls == this.castClasses[i].abbrev)
									selected = ' selected';
								classSel += `<option${selected}>${this.castClasses[i].abbrev}</option>`;
							}
							classSel += `</select>\n`;
						}
						checkbox = `<input class="checkbox" type="checkbox" id="${this.totalSpells}" name="spell${this.totalSpells}" value="${spell.uuid}"${checked}></input>`;
						break;
					case 'always':
						checkbox = `<span class="spelltype">&check;</span>`;
						always = true;
						break;
					case 'pact':
						checkbox = `<span class="spelltype">P</span>`;
						pact = true;
						break;
					case 'atwill':
						checkbox = `<span class="spelltype">AW</span>`;
						atwill = true;
						break;
					case 'innate':
						checkbox = `<span class="spelltype">Inn</span>`;
						innate = true;
						break;
					default:
						checkbox = `<span class="spelltype">*</span>`;
						break;
					}
					let text = `<td class="vcenter">${checkbox}${classSel}<label class="label" for="spell${this.totalSpells}"><a class="control showuuid" uuid="${spell.uuid}">${spell.name}</a></label></td>\n`;
					spellTxt += text;
					if (levcnt % ncols == 0)
						spellTxt += `<tr>\n`;
				});
				if (spellTxt) {
					spellList += `<p><b>Level ${level}</b></p>`;
					nrows++;
					
					spellList += `<table style="padding-bottom: 12px;">`;
					spellList += spellTxt;
					if (levcnt % ncols != 0) {
						for (let i = 0; i < ncols - levcnt % ncols; i++)
							spellList += `<td></td>\n`;
						spellList += `</tr>\n`;
					}
					spellList += `</table>\n`;
				}
			}

			let colwidth = Math.trunc(100 / ncols);

			content = `<style>
				desc {
					font-size: 12px;
				}
				.choices {
					font-size: 16px;
					text-color: maroon;
					font-style: bold;
				}
				.vcenter {
					vertical-align: middle;
					width: ${colwidth}%;
					padding: 0px;
				}
				.checkbox, select {
					vertical-align: middle;
					font-size: 12px;
					padding: 0px;
				}
				.label {
					font-size: 12px;
					vertical-align: middle;
					padding: 0px;
				}
				.spelltype {
					display: inline-block;
					width: 30px;
					font-size: 12px;
					text-align: center;
					font-weight: bold;
				}
				.showhelp {
					font-weight: bold;
				}
				td, table, tr {
					background-color: rgba(0, 0, 0, 0);
					border: 0px;
					padding: 0px;
					vertical-align: middle;
				}
			</style>\n`;

			content += `<p class="desc">Check the spells you wish to prepare (<a class="control showhelp">Click Here for Help</a>)</p>\n`;
			if (this.castClasses.length > 1) {
				content += `<p class="desc">To change the class the spell is memorized for, click the class dropdown.</p>\n`;
			}

			for (let i = 0; i < this.castClasses.length; i++) {
				let c = this.castClasses[i];
				content += `<p class="choices">${c.name} spells prepared: <span id="count${c.abbrev}">${c.count}</span> of <span id="limit${c.abbrev}">${c.limit}</span> -- level ${c.level} + ${c.mod} (${dnd5e.config.abilities[c.ability].label} ${c.abil})</p>\n`;
			}

			const rowheight = 32;
			let height = Math.min(600, rowheight * nrows);
			content += `<div style="height: ${height}px; padding-bottom: 12px; overflow-y: scroll">`;
			content += spellList;
			content += `</div><br>`;
		}
		return content;
	}

	actor = null;	

	async prepareSpells(actor) {
		
		async function prepSpells(sp, actor, html, totalSpells) {
			let selections = [];
			for (let i = 1; i <= totalSpells; i++) {
				let cb = html.find(`#${i}`);
				if (cb.length == 0 || !cb[0].value)
					continue;
				let arr = cb[0].value.split(".");
				let id = arr[arr.length - 1];
				let spell = actor.items.find(s => s.id == id);

				if (spell && sp.castClasses.length > 1) {
					// If two classes prepare spells remember which
					// class has which spell.
					let cls = html.find(`#cls${i}`);
					if (cls) {
						let cc = cls[0].value;
						let spellClass = spell.getFlag('fs-spl-prp', 'cls');
						if (cc != spellClass) {
							await actor.updateEmbeddedDocuments("Item",
								[{ "_id": id, [`flags.fs-spl-prp.cls`]: cc }]
							);
						}
					}
				}
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
		  title: `${actor.name}: Prepare Spells`,
		  content: content,
		  buttons: {
			ok: {
			  label: "Finished",
			  callback: async (html) => {
				  await prepSpells(this, actor, html, this.totalSpells);
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
				this.handleChoiceRender(this, html);
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
