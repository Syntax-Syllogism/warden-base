/**
 * Builds users for trigger tests that run under a specific profile.
 */
@IsTest
public class wdn_TriggerTestUsers {
  /**
   * Builds an unsaved user, preferring the Minimum Access - Salesforce profile.
   * @param alias The alias used for the user's name and email addresses.
   * @return The user record for the caller to insert before running the test.
   */
  public static User minimalAccessUser(String alias) {
    List<Profile> profiles = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Minimum Access - Salesforce' AND UserType = 'Standard'
      LIMIT 1
    ];
    if (profiles.isEmpty()) {
      profiles = [
        SELECT Id
        FROM Profile
        WHERE
          UserLicense.Name = 'Salesforce'
          AND UserType = 'Standard'
          AND PermissionsModifyAllData = FALSE
        ORDER BY Name
        LIMIT 1
      ];
    }
    return new User(
      Alias = alias,
      LastName = alias,
      Email = alias + '@example.test',
      Username =
        alias
        + '.'
        + System.now().getTime()
        + '.'
        + Crypto.getRandomInteger()
        + '@example.test',
      ProfileId = profiles[0].Id,
      TimeZoneSidKey = 'America/New_York',
      LocaleSidKey = 'en_US',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
  }
}
