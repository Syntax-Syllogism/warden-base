@IsTest
private class wdn_UserRequiredValidationTest {
  // Packaging can't make a lookup to User required, so a validation rule does.
  private static Database.Error insertError(SObject row) {
    Database.SaveResult result =
      Database.insert(row, false, AccessLevel.SYSTEM_MODE);
    return result.isSuccess() ? null : result.getErrors()[0];
  }

  private static void assertUserRequired(Database.Error error) {
    System.assertNotEquals(null, error, 'A blank user must be rejected');
    System.assertEquals(
      StatusCode.FIELD_CUSTOM_VALIDATION_EXCEPTION,
      error.getStatusCode()
    );
    System.assertEquals(new List<String>{ 'wdn_User__c' }, error.getFields());
  }

  @IsTest
  static void assignmentRequiresUser() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('requser');
    insert as system user;
    wdn_Persona__c persona =
      new wdn_Persona__c(Name = 'Operator', wdn_Api_Name__c = 'operator');
    insert as system persona;
    System.runAs(user) {
      Database.Error error =
        insertError(
          new wdn_Persona_Assignment__c(
            wdn_Persona__c = persona.Id,
            wdn_Status__c = 'Active'
          )
        );
      System.assertNotEquals(null, error, 'A blank user must be rejected');
      assertUserRequired(error);
    }
  }

  @IsTest
  static void grantRequiresUser() {
    User user = wdn_TriggerTestUsers.minimalAccessUser('requser');
    insert as system user;
    System.runAs(user) {
      Database.Error error =
        insertError(
          new wdn_Provisioned_Grant__c(
            wdn_Type__c = 'Permission Set',
            wdn_Target_Id__c = 'target'
          )
        );
      System.assertNotEquals(null, error, 'A blank user must be rejected');
      assertUserRequired(error);
    }
  }
}
