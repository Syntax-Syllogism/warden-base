trigger wdn_AssignmentRegrant on wdn_Persona_Assignment__c(
  before insert,
  before update
) {
  wdn_AssignmentRegrantHandler.clearRevocation(
    Trigger.new,
    Trigger.oldMap,
    Trigger.operationType
  );
}
