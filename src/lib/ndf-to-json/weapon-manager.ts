import { search } from '@izohek/ndf-parser';
import { NdfObject } from '@izohek/ndf-parser/dist/src/types';
import { AbstractManager } from './abstract-manager';
import { MappedNdf, NdfManager } from './ndf-manager';
import { MountedWeapon, MountedWeaponManager } from './mounted-weapon-manager';
import { Missile } from './missile-manager';
import { Smoke } from './smoke-manager';
import { AccuracyDataPointsForType } from './ammunition-manager';

export type Weapon = {
  aimingTime: number;
  ammoDescriptorName: string;
  ammunitionPerSalvo: number;
  firesLeftToRight: boolean;
  groundMinRange: number;
  groundRange: number;
  hasTurret: boolean;
  he: number;
  heDamageRadius: number;
  helicopterMinRange: number;
  helicopterRange: number;
  instaKillAtMaxRangeArmour: number;
  missileProperties?: Missile;
  movingAccuracy: number;
  movingAccuracyScaling?: AccuracyDataPointsForType;
  numberOfWeapons: number;
  penetration: number;
  planeMinRange: number;
  planeRange: number;
  rateOfFire: number;
  reloadTime: number;
  salvoIndex: number;
  salvoLength: number;
  showInInterface: boolean;
  smokeProperties?: Smoke;
  staticAccuracy: number;
  staticAccuracyScaling?: AccuracyDataPointsForType;
  supplyCost: number;
  suppress: number;
  suppressDamagesRadius: number;
  timeBetweenSalvos: number;
  totalHeDamage: number;
  traits: string[];
  trueRateOfFire: number;
  turretRotationSpeed: number;
  weaponName: string;
};

export type MountedWeaponWithTurret = MountedWeapon & Turret;

export type Turret = {
  hasTurret: boolean;
  turretRotationSpeed: number;
};

/**
 * Weapon manager class that extracts weapon data from the weaponDescriptor, it also extracts ammo data from the ammoDescriptor using the ammoManager
 */
export class WeaponManager extends AbstractManager {
  constructor(
    weaponDescriptor: NdfObject,
    mappedAmmo: MappedNdf,
    mappedSmoke: MappedNdf,
    mappedMissiles: MappedNdf
  ) {
    super(weaponDescriptor);
    this.mappedAmmo = mappedAmmo;
    this.mappedSmoke = mappedSmoke;
    this.mappedMissiles = mappedMissiles;
  }

  mappedAmmo: MappedNdf;
  mappedSmoke: MappedNdf;
  mappedMissiles: MappedNdf;

  /**
   * Parses the weapon descriptor and returns the weapon data
   * @returns  Weapon data
   *
   */
  parse(): { weapons: Weapon[]; hasDefensiveSmoke: boolean } {
    const rawSalvomap = this.getFirstSearchResult('Salves');
    const salvoMap = this.parseSalvoMap(rawSalvomap);

    // const extractedMountedWeapons: MountedWeapon[] = [];

    const rawTurretDescriptors = this.getFirstSearchResult(
      'TurretDescriptorList'
    );
    const turretDescriptors =
      NdfManager.extractValuesFromSearchResult(rawTurretDescriptors);

    let hasDefensiveSmoke = false;


    const extractedMountedWeapons: MountedWeaponWithTurret[] = [];
    
    /**
     * Loop through all the turret descriptors and extract the mounted weapons
     * If the mounted weapon is a smoke launcher, it is not added to the extractedMountedWeapons array
     */
    for (const turretDescriptor of turretDescriptors) {
      let isSmokeLauncher = false;

      const turretRotationSpeed = Number(
        NdfManager.extractValueFromSearchResult(
          search(turretDescriptor, 'VitesseRotation')[0]
        )
      );

      let hasTurret = false;
      if (turretRotationSpeed) {
        hasTurret = true;
      }

      const turret: Turret = {
        hasTurret,
        turretRotationSpeed
      }

      const mountedWeaponsSearch = search(
        turretDescriptor,
        'MountedWeaponDescriptorList'
      )[0];
      const mountedWeapons =
        NdfManager.extractValuesFromSearchResult<NdfObject>(
          mountedWeaponsSearch
        );

      

      /**
       * Loop through all the mounted weapons and extract the ammo data
       * If the mounted weapon is a smoke launcher, it is not added to the extractedMountedWeapons array
       */
      for (const mountedWeaponDescriptor of mountedWeapons) {
        isSmokeLauncher = this.isMountedWeaponSmoke(mountedWeaponDescriptor);

        if (isSmokeLauncher) {
          hasDefensiveSmoke = true;
        }

        if (!isSmokeLauncher) {
          const mountedWeaponManager = new MountedWeaponManager(
            mountedWeaponDescriptor,
            this.mappedAmmo,
            this.mappedSmoke,
            this.mappedMissiles,
            salvoMap
          );
          const mountedWeapon = mountedWeaponManager.parse();
          extractedMountedWeapons.push({...mountedWeapon, ...turret});
        }
      }
    }

    /**
     * Filter out the mounted weapons that are not shown in the game interface
     */
    const shownMountedWeapons = extractedMountedWeapons.filter(
      (turretWithMountedWeapons) => turretWithMountedWeapons.showInterface
    );

    /**
     * Filter out the salvo indexes that are not used
     */
    const filteredSalvoMap = salvoMap.filter((salvo: number) => salvo !== -1);

    const weapons: Weapon[] = [];

    /**
     * Loop through all the salvo indexes and merge the weapons that have the same salvo index
     * The merged weapon is then added to the weapons array
     */
    for (
      let salvoIndex = 0;
      salvoIndex < filteredSalvoMap.length;
      salvoIndex++
    ) {
      const weaponsForSalvoIndex = shownMountedWeapons.filter(
        (mountedWeapon) => mountedWeapon.salvoIndex === salvoIndex
      );

      const firstWeapon = weaponsForSalvoIndex[0];

      if(firstWeapon) {
        const totalHeDamage = Number((firstWeapon.ammo.heDamage * firstWeapon.ammo.salvoLength * firstWeapon.numberOfWeapons).toFixed(2));

        const supplyCost = salvoMap[salvoIndex] * firstWeapon.ammo.supplyCostPerSalvo

        const mergedWeapon: Weapon = {
          aimingTime: firstWeapon.ammo.aimingTime,
          ammoDescriptorName: firstWeapon.ammo.descriptorName,
          ammunitionPerSalvo: firstWeapon.ammo.ammunitionPerSalvo,
          firesLeftToRight: firstWeapon.ammo.firesLeftToRight,
          groundMinRange: firstWeapon.ammo.groundMinRange,
          groundRange: firstWeapon.ammo.groundMaxRange,
          hasTurret: firstWeapon.hasTurret,
          he: firstWeapon.ammo.heDamage,
          heDamageRadius: firstWeapon.ammo.heDamageRadius,
          helicopterMinRange: firstWeapon.ammo.heliMinRange,
          helicopterRange: firstWeapon.ammo.heliMaxRange,
          instaKillAtMaxRangeArmour: firstWeapon.ammo.instaKillAtMaxRangeArmour,
          missileProperties: firstWeapon.ammo.missile,
          movingAccuracy: firstWeapon.ammo.movingAccuracy,
          movingAccuracyScaling: firstWeapon.ammo.movingAccuracyOverDistance,
          numberOfWeapons: firstWeapon.numberOfWeapons,
          penetration: firstWeapon.ammo.penetration,
          planeMinRange: firstWeapon.ammo.planeMinRange,
          planeRange: firstWeapon.ammo.planeMaxRange,
          rateOfFire: firstWeapon.ammo.rateOfFire,
          reloadTime: firstWeapon.ammo.reloadTime,
          salvoIndex: firstWeapon.salvoIndex,
          salvoLength: firstWeapon.ammo.salvoLength,
          showInInterface: firstWeapon.showInterface,
          smokeProperties: firstWeapon.ammo.smoke,
          staticAccuracy: firstWeapon.ammo.staticAccuracy,
          staticAccuracyScaling: firstWeapon.ammo.staticAccuracyOverDistance,
          supplyCost: supplyCost,
          suppress: firstWeapon.ammo.suppress,
          suppressDamagesRadius: firstWeapon.ammo.suppressDamagesRadius,
          timeBetweenSalvos: firstWeapon.ammo.timeBetweenSalvos,
          totalHeDamage: totalHeDamage,
          traits: firstWeapon.ammo.traits,
          trueRateOfFire: firstWeapon.ammo.trueRateOfFire,
          turretRotationSpeed: firstWeapon.turretRotationSpeed,
          weaponName: firstWeapon.ammo.name,
        };
  
        /**
         * Loop through all the weapons that have the same salvo index and merge the data
         */
        for (let i = 1; i < weaponsForSalvoIndex.length; i++) {
          const mountedWeapon = weaponsForSalvoIndex[i];
          const ammoDescriptorName = mountedWeapon.ammo.descriptorName;
  
          if (ammoDescriptorName.includes('_AP_')) {
            mergedWeapon.penetration = mountedWeapon.ammo.penetration;
          }
  
          if (ammoDescriptorName.includes('_HE_')) {
            mergedWeapon.he = mountedWeapon.ammo.heDamage;
          } else if (
            !ammoDescriptorName.includes('_AP_') &&
            (ammoDescriptorName.includes('_GatlingAir_') ||
              ammoDescriptorName.includes('Gatling'))
          ) {
            mergedWeapon.he = mountedWeapon.ammo.heDamage;
          }
  
          if (mountedWeapon.ammo.smoke) {
            mergedWeapon.smokeProperties = mountedWeapon.ammo.smoke;
          }
  
          mergedWeapon.suppress = this.getBestValue(
            mergedWeapon.suppress,
            mountedWeapon.ammo.suppress
          ) * mergedWeapon.numberOfWeapons;
          mergedWeapon.groundRange = this.getBestValue(
            mergedWeapon.groundRange,
            mountedWeapon.ammo.groundMaxRange
          );
          mergedWeapon.helicopterRange = this.getBestValue(
            mergedWeapon.helicopterRange,
            mountedWeapon.ammo.heliMaxRange
          );
          mergedWeapon.planeRange = this.getBestValue(
            mergedWeapon.planeRange,
            mountedWeapon.ammo.planeMaxRange
          );
        }
  
        weapons.push(mergedWeapon);
      }

    }

    return { weapons, hasDefensiveSmoke };
  }

  /**
   * Checks if the mounted weapon is a smoke launcher
   * @param mountedWeaponDescriptor The mounted weapon descriptor
   * @returns True if the mounted weapon is a smoke launcher
   */
  isMountedWeaponSmoke(mountedWeaponDescriptor: NdfObject): boolean {
    const ammunition: string = NdfManager.extractValueFromSearchResult(
      search(mountedWeaponDescriptor, 'Ammunition')[0]
    );

    if (ammunition?.includes('Ammo_SMOKE_Vehicle')) {
      return true;
    }

    return false;
  }

  /**
   * Parses the salvo map and returns the salvo data
   * @param salvoMap The salvo map
   * @returns The salvo data
   */
  parseSalvoMap(salvoMap: any): number[] {
    return (
      NdfManager.extractValuesFromSearchResult(salvoMap)?.map((el: any) =>
        Number(el.value)
      ) || []
    );
  }

  /**
   *  Gets the best value between two values
   * @param value1
   * @param value2
   * @returns The best value
   */
  getBestValue(value1: number, value2: number): number {
    if (value1 > value2) {
      return value1;
    }

    return value2;
  }
}
