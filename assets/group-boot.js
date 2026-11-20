// Restore the user's own group before the first schedule request, never a teacher/room view.
function validSavedGroup(value){return value&&Number(value.target)===1&&Number.isInteger(Number(value.id))&&Number(value.id)>0&&typeof value.title==='string'}
if(!validSavedGroup(state.pinnedGroup)&&validSavedGroup(state.officialGroup))state.pinnedGroup={...state.officialGroup};
if(validSavedGroup(state.pinnedGroup)){state.group=state.pinnedGroup.title;state.officialGroup={...state.pinnedGroup};state.officialSelection={...state.pinnedGroup};$('#group-label').textContent=state.group;$('#settings-group-name').textContent=state.group;save()}
state.savedGroupTargets=Array.isArray(state.savedGroupTargets)?state.savedGroupTargets.filter(validSavedGroup):[];
for(const group of [state.pinnedGroup,state.officialGroup])if(validSavedGroup(group)&&!state.savedGroupTargets.some(g=>g.id===group.id))state.savedGroupTargets.unshift({...group});
