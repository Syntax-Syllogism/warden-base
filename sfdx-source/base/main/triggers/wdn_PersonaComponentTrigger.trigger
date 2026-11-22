trigger wdn_PersonaComponentTrigger on wdn_Persona_Component__c(
  before insert,
  before update,
  before delete
) {
  wdn_PersonaComponentLockHandler.lockParents(
    Trigger.isDelete ? Trigger.old : Trigger.new
  );
}
