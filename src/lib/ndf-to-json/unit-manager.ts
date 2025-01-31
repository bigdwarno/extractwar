import { search } from '@izohek/ndf-parser';
import { NdfObject, ParserMap } from '@izohek/ndf-parser/dist/src/types';
import { findUnitCardByDescriptor } from '@izohek/warno-db';
import { NdfExtractAsJson, SpeedModifier } from '../../commands/ndf-to-json';
import { AbstractManager } from './abstract-manager';
import { MappedNdf, NdfManager } from './ndf-manager';
import { isNdfObject } from './utils';
import { Weapon, WeaponManager } from './weapon-manager';

export enum InfoPanelType {
  DEFAULT = 'default',
  SUPPLY_VEHICLE = 'supply-vehicle',
  TRANSPORT_VEHICLE = 'transport-vehicle',
  INFANTRY = 'infantry',
  PLANE = 'plane',
  HELICOPTER = 'helicopter',
  TRANSPORT_HELICOPTER = 'transport-helicopter',
  SUPPLY_HELICOPTER = 'supply-helicopter',
}

export interface NdfInfoPanelMap {
  [key: string]: InfoPanelType;
}

const infoPanelMap: NdfInfoPanelMap = {
  Default: InfoPanelType.DEFAULT,
  VehiculeSupplier: InfoPanelType.SUPPLY_VEHICLE,
  VehiculeTransporter: InfoPanelType.TRANSPORT_VEHICLE,
  Infantry: InfoPanelType.INFANTRY,
  avion: InfoPanelType.PLANE,
  HelicoDefault: InfoPanelType.HELICOPTER,
  HelicoTransporter: InfoPanelType.TRANSPORT_HELICOPTER,
  HelicoSupplier: InfoPanelType.SUPPLY_HELICOPTER,
};

export enum ArmourToken {
  Blindage = 'Blindage',
  Infanterie = 'Infanterie',
  Vehicule = 'Vehicule',
  Helico = 'Helico',
}

export type Unit = {
  descriptorName: string;
  name: string;
  category: string;
  id: number;
  unitType: UnitType;
  commandPoints: number;
  infoPanelType: InfoPanelType;
  factoryDescriptor: string;
  frontArmor: number;
  sideArmor: number;
  rearArmor: number;
  topArmor: number;
  maxDamage: number;
  speed: number;
  speedsForTerrains?: SpeedOnTerrain[];
  roadSpeed: number;
  rotationTime: number;
  optics: number;
  airOptics: number;
  bombStrategy: string | undefined;
  stealth: number;
  advancedDeployment: number;
  fuel: number;
  fuelMove: number;
  supply: number;
  ecm: number;
  agility?: number;
  travelTime: number | null;
  specialities: string[];
  hasDefensiveSmoke: boolean;
  weapons: Weapon[];
}

export type SpeedOnTerrain = {
  name: string;
  speed: number;
}

export type UnitType = {
  nationality: string;
  motherCountry: string;
  formation: string;
};

/**
 * Responsible for extracting properties for units
 */
export class UnitManager extends AbstractManager {
  constructor(
    unitDescriptor: NdfObject,
    speedModifiers: SpeedModifier[],
    mappedWeapons: MappedNdf,
    mappedAmmo: MappedNdf,
    mappedSmoke: MappedNdf,
    mappedMissiles: MappedNdf
  ) {
    super(unitDescriptor);
    this.speedModifiers = speedModifiers;
    this.mappedWeapons = mappedWeapons;
    this.mappedAmmo = mappedAmmo;
    this.mappedSmoke = mappedSmoke;
    this.mappedMissiles = mappedMissiles;
  }

  speedModifiers: SpeedModifier[];
  mappedWeapons: MappedNdf;
  mappedAmmo: MappedNdf;
  mappedSmoke: MappedNdf;
  mappedMissiles: MappedNdf;

  parse() {
    const descriptorName = this.ndf.name;

    const localizedUnitCard = findUnitCardByDescriptor(descriptorName);

    let name = localizedUnitCard?.name || "";

    if (name && name.length === 0) {
      name = this.prettyUnitNameFromDescriptor(descriptorName);
    }

    const category = localizedUnitCard?.category || "";
    const id = localizedUnitCard?.code || -1;

    const unitType = this.extractUnitType();

    const productionResources = this.getFirstSearchResult(
      'ProductionRessourcesNeeded'
    );

    const commandPoints = Number(NdfManager.extractTupleFromMap(
      productionResources.value as ParserMap,
      'Resource_CommandPoints'
    ));

    const descriptorInformationPanelType = this.getValueFromSearch<string>(
      'InfoPanelConfigurationToken'
    ).replace(/'/g, '');
    const infoPanelType = infoPanelMap[descriptorInformationPanelType];

    const factoryDescriptor = this.getValueFromSearch<string>(
      'Factory'
    );
    const armourValues = this.extractArmourValues();
    const maxDamage = Number(this.getValueFromSearch<string>('MaxDamages'));

    const speed = Math.round(
      NdfManager.parseNumberFromMetre(this.getValueFromSearch('MaxSpeed'))
    );

    const unitMoveTypeValue = this.getValueFromSearch<string>('UnitMovingType');
    let speedsForTerrains;
    if (unitMoveTypeValue) {
      speedsForTerrains = this.calculateSpeedsForTerrains(
        unitMoveTypeValue,
        speed
      );
    }

    const roadSpeed = Math.round(this.getValueFromSearch('RealRoadSpeed'));
    const rotationTime = Number(this.getValueFromSearch('TempsDemiTour'));
    const optics = Number(this.getValueFromSearch('OpticalStrength'));
    const airOptics = Number(
      this.getValueFromSearch('OpticalStrengthAltitude')
    );
    const bombStrategy = this.getBombStrategy();
    const stealth = Number(this.getValueFromSearch('UnitConcealmentBonus'));
    const deploymentShift = this.getValueFromSearch<string | undefined>(
      'DeploymentShift'
    );
    const advancedDeployment = deploymentShift
      ? Math.round(NdfManager.parseNumberFromMetre(deploymentShift))
      : 0;
    const fuel = Number(this.getValueFromSearch('FuelCapacity'));
    const fuelMove = Number(this.getValueFromSearch('FuelMoveDuration'));
    const supply = Number(this.getValueFromSearch('SupplyCapacity'));
    const ecm = Number(this.getValueFromSearch('HitRollECM'));

    /**
     * Parse the agility radius from the descriptor and parse the number from the metre string when the value is present
     */
    const agilityRadius = this.getValueFromSearch<string | undefined>(
      'AgilityRadius'
    )
      ? Math.round(
          NdfManager.parseNumberFromMetre(
            this.getValueFromSearch('AgilityRadius')
          )
        )
      : undefined;

    const travelTime = Number(this.getValueFromSearch('TravelDuration')) || null;

    /**
     * Extract weapon data for the weapon descriptors associated to this descriptor by finding the weapon manager and then using  the weapon manager to extract the weapon data
     */

    const weaponManagerSearchResult =
      this.getFirstSearchResult('WeaponManager');
    const weaponManagerPath =
      weaponManagerSearchResult?.children[0]?.value?.value;

    let weapons: Weapon[] = []
    let hasDefensiveSmoke = false;

    if (weaponManagerPath !== undefined) {
      const weaponManagerId = NdfManager.extractLastToken(weaponManagerPath);
      const weaponManagerDescriptor = this.mappedWeapons[weaponManagerId];

      if (isNdfObject(weaponManagerDescriptor)) {
        const weaponManager = new WeaponManager(
          weaponManagerDescriptor,
          this.mappedAmmo,
          this.mappedSmoke,
          this.mappedMissiles
        );
        const { weapons: parsedWeapons, hasDefensiveSmoke: smoke } = weaponManager.parse();

        weapons = [...parsedWeapons];
        hasDefensiveSmoke = smoke;
      }
    }

    const specialities = this.getSpecialities();

    const unit: Unit = {
      descriptorName,
      name,
      category,
      id,
      unitType,
      commandPoints,
      infoPanelType,
      factoryDescriptor,
      frontArmor: armourValues.front,
      sideArmor: armourValues.side,
      rearArmor: armourValues.rear,
      topArmor: armourValues.top,
      maxDamage,
      speed,
      speedsForTerrains,
      roadSpeed,
      rotationTime,
      optics,
      airOptics,
      bombStrategy,
      stealth,
      advancedDeployment,
      fuel,
      fuelMove,
      supply,
      ecm,
      agility: agilityRadius,
      travelTime,
      specialities,
      hasDefensiveSmoke,
      weapons
    };

    return unit;
  }

  /**
   *  Extracts the armour values from the unit descriptor
   * @returns armour values object
   */
  private extractArmourValues() {
    const frontArmour = this.getValueFromSearch<string>('ArmorDescriptorFront');
    const sideArmour = this.getValueFromSearch<string>('ArmorDescriptorSides');
    const rearArmour = this.getValueFromSearch<string>('ArmorDescriptorRear');
    const topArmour = this.getValueFromSearch<string>('ArmorDescriptorTop');

    return {
      front: this.convertArmourTokenToNumber(frontArmour),
      side: this.convertArmourTokenToNumber(sideArmour),
      rear: this.convertArmourTokenToNumber(rearArmour),
      top: this.convertArmourTokenToNumber(topArmour),
    };
  }

  /**
   * Calculates the speed for each terrain type
   * @param unitMoveTypeValue
   * @param speed
   */
  private calculateSpeedsForTerrains(unitMoveTypeValue: string, speed: number): SpeedOnTerrain[] {
    const speedForTerrains: SpeedOnTerrain[] = [];
    const speedModifiers = this.speedModifiers;
    const moveType = NdfManager.extractLastToken(unitMoveTypeValue);

    for (const speedModifier of speedModifiers) {
      const moveTypes = Object.keys(speedModifier.movementTypes);
      const foundMoveType = moveTypes.find((_moveType) =>
        moveType.includes(_moveType)
      );

      if (foundMoveType) {
        const modifier =
          speedModifier.movementTypes[
            foundMoveType as keyof typeof speedModifier.movementTypes
          ];
        const modifiedSpeed = Math.round(speed * modifier.value);
        speedForTerrains.push({
          speed: modifiedSpeed,
          name: speedModifier.name,
        });
      }
    }

    return speedForTerrains;
  }

  /**
   * Calculates the specialties for the unit by extract SpecialtiesList from the descriptor
   * @returns array of specialties
   */
  private getSpecialities(): string[] {
    const specialitiesList = this.getFirstSearchResult('SpecialtiesList');
    let specialties =
      NdfManager.extractValuesFromSearchResult<string>(specialitiesList);

    // Maps and filters the specialties to remove the appui speciality and remove the quotes
    specialties = specialties
      ?.map((specialty: any) => {
        return specialty.value
          .replace(/^(["']*)/g, '')
          .replace(/(["']*)$/g, '');
      })
      .filter((specialty: any) => {
        return specialty && specialty !== 'appui';
      });

    return specialties;
  }

  /**
   * Calculates the bomb strategy for the unit
   * @returns string representing the bomb strategy
   */
  private getBombStrategy(): string | undefined {
    const diveBombResult = this.getFirstSearchResult(
      'TDiveBombAttackStrategyDescriptor'
    );
    const normalBombResult = this.getFirstSearchResult(
      'TBombAttackStrategyDescriptor'
    );

    if (diveBombResult) {
      return 'DIVE';
    }

    if (normalBombResult) {
      return 'NORMAL';
    }
  }

  /**
   * Returns a number representing the armour value
   * @param armourToken armour token from ndf value
   * @returns number representing armour value
   */
  private convertArmourTokenToNumber(armourToken: string): number {
    const armourTokenTokens = armourToken.split('_');
    const armourType = armourTokenTokens[1];
    const armourStrength = armourTokenTokens[2];

    // If leger is returned, this is light armour and displays as >1 in Unit cards
    if (armourStrength === 'leger') {
      return 0.5;
    }

    // If infanterie, then this is 0 armour
    if ((armourType as unknown as ArmourToken) === ArmourToken.Infanterie) {
      return 0;
    }

    if ((armourType as unknown as ArmourToken) === ArmourToken.Helico) {
      const baseArmourValue = Number(armourStrength);

      const helicoArmour = baseArmourValue - 1;
      if (helicoArmour >= 1) {
        return helicoArmour;
      }

      return 0.5;
    }

    return Number(armourStrength);
  }

  /**
   * Extracts the unit type from the descriptor
   * @returns unit type object
   */
  private extractUnitType(): UnitType {
    const unitTypePrettyKeys = {
      Nationalite: 'nationality',
      MotherCountry: 'motherCountry',
      TypeUnitFormation: 'formation',
    };

    const unitType = {
      nationality: '',
      motherCountry: '',
      formation: '',
    };

    const unitTypeSearchResult = this.getFirstSearchResult(
      'TTypeUnitModuleDescriptor'
    );

    for (const unitModule of unitTypeSearchResult.children) {
      const prettyValue =
        unitTypePrettyKeys[unitModule.name as keyof typeof unitTypePrettyKeys];
      if (prettyValue) {
        unitType[prettyValue as keyof typeof unitType] =
          unitModule.value.value.replace(/'/g, '');
      }
    }

    return unitType;
  }

  /**
   * Converts a descriptor name to a pretty unit name
   * @param descriptor descriptor name
   * @returns  pretty unit name
   */
  private prettyUnitNameFromDescriptor(descriptor: string): string {
    return descriptor
      .replace(/^Descriptor_Unit_/g, '')
      .split('_')
      .join(' ');
  }
}
