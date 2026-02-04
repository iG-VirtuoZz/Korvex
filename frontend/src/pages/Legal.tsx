import React from "react";

const Legal: React.FC = () => (
  <div className="legal-page">

    <h2>Mentions Legales</h2>
    <p><strong>Editeur du site :</strong> KORVEX Pool - Exploite par un particulier</p>
    <p><strong>Contact :</strong> guillaumesastre34@gmail.com</p>
    <p><strong>Hebergeur :</strong> OVH SAS - 2 rue Kellermann, 59100 Roubaix, France</p>
    <p><strong>Domaine :</strong> korvexpool.com</p>

    <hr />

    <h2>Conditions Generales d'Utilisation (CGU)</h2>
    <p>Derniere mise a jour : 31 janvier 2026</p>

    <h3>1. Objet</h3>
    <p>
      KORVEX est une pool de minage communautaire pour la blockchain ERGO (algorithme Autolykos2).
      En connectant votre materiel de minage a KORVEX, vous acceptez les presentes conditions.
    </p>

    <h3>2. Fonctionnement</h3>
    <ul>
      <li><strong>Algorithme :</strong> Autolykos2 (ERGO)</li>
      <li><strong>Methode de paiement :</strong> PPLNS (Pay Per Last N Shares)</li>
      <li><strong>Frais de la pool :</strong> 1% preleves sur les recompenses de blocs</li>
      <li><strong>Seuil minimum de paiement :</strong> 1 ERG</li>
      <li><strong>Port Stratum :</strong> 3416</li>
    </ul>

    <h3>3. Responsabilite</h3>
    <ul>
      <li>KORVEX ne garantit aucun revenu. Le minage depend de la puissance de calcul, de la difficulte du reseau et de la chance.</li>
      <li>KORVEX ne peut etre tenu responsable des interruptions de service (maintenance, pannes, mises a jour).</li>
      <li>KORVEX ne peut etre tenu responsable des pertes liees aux fluctuations du cours de l'ERG.</li>
      <li>Les recompenses de blocs orphelins ou rejetes par le reseau ne sont pas distribuees.</li>
    </ul>

    <h3>4. Obligations du mineur</h3>
    <ul>
      <li>Fournir une adresse ERGO valide pour recevoir les paiements.</li>
      <li>Ne pas tenter d'attaquer ou de perturber le fonctionnement de la pool.</li>
      <li>Ne pas envoyer de shares invalides de maniere abusive (limite de 50 shares invalides avant bannissement temporaire).</li>
      <li>Limite de 10 connexions simultanees par adresse IP.</li>
    </ul>

    <h3>5. Paiements</h3>
    <ul>
      <li>Les paiements sont effectues automatiquement lorsque le solde atteint le seuil minimum de 1 ERG.</li>
      <li>Les frais de transaction sur le reseau ERGO sont a la charge du mineur.</li>
      <li>KORVEX se reserve le droit de modifier les frais et le seuil de paiement avec un preavis raisonnable.</li>
    </ul>

    <h3>6. Bannissement</h3>
    <p>
      KORVEX se reserve le droit de bannir temporairement ou definitivement tout mineur en cas d'abus,
      de tentative d'attaque, ou de comportement nuisible au bon fonctionnement de la pool.
    </p>

    <h3>7. Modification des CGU</h3>
    <p>
      KORVEX peut modifier les presentes CGU a tout moment. Les modifications prennent effet
      des leur publication sur cette page. Il est recommande de consulter regulierement cette page.
    </p>

    <hr />

    <h2>Politique de Confidentialite</h2>
    <p>Derniere mise a jour : 31 janvier 2026</p>

    <h3>1. Donnees collectees</h3>
    <p>KORVEX collecte uniquement les donnees necessaires au fonctionnement de la pool :</p>
    <ul>
      <li><strong>Adresse ERGO</strong> : pour identifier les mineurs et distribuer les paiements</li>
      <li><strong>Adresse IP</strong> : pour la securite et la limitation des connexions abusives</li>
      <li><strong>Nom du worker</strong> : pour distinguer les differentes machines d'un meme mineur</li>
      <li><strong>Statistiques de minage</strong> : hashrate, shares soumises, blocs trouves</li>
    </ul>

    <h3>2. Donnees NON collectees</h3>
    <p>KORVEX ne collecte aucune donnee personnelle telle que :</p>
    <ul>
      <li>Nom, prenom, adresse postale</li>
      <li>Adresse email</li>
      <li>Numero de telephone</li>
      <li>Cookies de suivi ou traceurs publicitaires</li>
    </ul>

    <h3>3. Utilisation des donnees</h3>
    <p>Les donnees collectees sont utilisees exclusivement pour :</p>
    <ul>
      <li>Le calcul et la distribution des recompenses de minage</li>
      <li>L'affichage des statistiques sur le tableau de bord</li>
      <li>La securite de la pool (prevention des abus)</li>
    </ul>

    <h3>4. Partage des donnees</h3>
    <p>
      KORVEX ne vend, ne loue et ne partage aucune donnee avec des tiers.
      Les adresses ERGO et statistiques de minage sont visibles publiquement sur le tableau de bord
      (comme c'est le cas sur toute pool de minage).
    </p>

    <h3>5. Conservation des donnees</h3>
    <ul>
      <li>Les shares sont conservees 7 jours puis supprimees automatiquement.</li>
      <li>Les statistiques de hashrate sont conservees 90 jours.</li>
      <li>Les adresses IP ne sont pas stockees de maniere permanente.</li>
    </ul>

    <h3>6. Droits (RGPD)</h3>
    <p>
      Conformement au Reglement General sur la Protection des Donnees (RGPD), vous disposez
      d'un droit d'acces, de rectification et de suppression de vos donnees.
      Pour exercer ces droits, contactez : guillaumesastre34@gmail.com
    </p>

    <h3>7. Contact</h3>
    <p>
      Pour toute question relative a cette politique de confidentialite :
      guillaumesastre34@gmail.com
    </p>
  </div>
);

export default Legal;
